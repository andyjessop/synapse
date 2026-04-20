import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { AssistantMessage, TextContent } from '@earendil-works/pi-ai';
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
} from '@earendil-works/pi-coding-agent';
import type { Tracer } from '@opentelemetry/api';
import type { GitLabMergeRequestClient } from 'adapter-gitlab';
import type {
  PiReviewClient,
  PiReviewRequest,
  PiReviewResult,
} from 'agent-reviewer';
import { PiReviewFailedError } from 'agent-reviewer';
import { type RuntimeMetrics, runWithRuntimeSpan } from 'runtime-observability';
import { ZodError } from 'zod';
import { createSynapsePiDevExtensionFactory } from './extensions/synapse-pi-dev-extension.js';
import {
  isPiHarnessProgressEnabled,
  subscribePiHarnessProgress,
} from './pi-harness-progress';
import { parsePiReviewModelString } from './pi-review-model';
import { createFetchMergeRequestDiffToolDefinition } from './tools/fetch-merge-request-diff-tool.js';

/** Traceability: not a shell command (see spec). */
export const PI_REVIEW_SDK_COMMAND = 'pi-sdk:createAgentSession' as const;

export type CreatePiReviewSdkClientInput = {
  repoRoot: string;
  gitlab: GitLabMergeRequestClient;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  tracer?: Tracer;
  metrics?: RuntimeMetrics;
  /** When `PI_HARNESS_PROGRESS` is enabled, optional sink instead of `stderr` (tests). */
  progressEmitLine?: (line: string) => void;
};

export function createPiReviewSdkClient(
  input: CreatePiReviewSdkClientInput,
): PiReviewClient {
  const env = input.env ?? process.env;
  const now = input.now ?? (() => Date.now());

  return {
    repoRoot: input.repoRoot,
    review: async (request) =>
      runPiSdkReview({
        request,
        repoRoot: input.repoRoot,
        gitlab: input.gitlab,
        env,
        now,
        tracer: input.tracer,
        metrics: input.metrics,
        progressEmitLine: input.progressEmitLine,
      }),
  };
}

async function runPiSdkReview(options: {
  request: PiReviewRequest;
  repoRoot: string;
  gitlab: GitLabMergeRequestClient;
  env: NodeJS.ProcessEnv;
  now: () => number;
  tracer?: Tracer;
  metrics?: RuntimeMetrics;
  progressEmitLine?: (line: string) => void;
}): Promise<PiReviewResult> {
  const run = async (): Promise<PiReviewResult> => {
    const started = options.now();
    let session:
      | Awaited<ReturnType<typeof createAgentSession>>['session']
      | undefined;
    try {
      const authStorage = AuthStorage.create();
      const openaiKey = options.env.OPENAI_API_KEY?.trim();
      if (openaiKey) {
        authStorage.setRuntimeApiKey('openai', openaiKey);
      }

      const modelRegistry = ModelRegistry.create(authStorage);
      let modelSpec: { provider: string; modelId: string };
      try {
        modelSpec = parsePiReviewModelString(options.env.PI_REVIEW_MODEL);
      } catch (error) {
        if (error instanceof ZodError) {
          throw new PiReviewFailedError(
            `Invalid PI_REVIEW_MODEL: ${error.issues.map((i) => i.message).join('; ')}`,
            1,
          );
        }
        throw error;
      }
      const model = modelRegistry.find(modelSpec.provider, modelSpec.modelId);
      if (model === undefined) {
        throw new PiReviewFailedError(
          `Unknown Pi review model "${modelSpec.provider}/${modelSpec.modelId}" (set PI_REVIEW_MODEL to a provider/model-id Pi supports)`,
          1,
        );
      }

      const extensionFactories =
        options.request.emitHarnessEvent === undefined
          ? []
          : [
              createSynapsePiDevExtensionFactory({
                emit: options.request.emitHarnessEvent,
                inputEventId: options.request.inputEventId,
                reviewSubject: options.request.subject,
                repoRoot: options.repoRoot,
              }),
            ];

      const resourceLoader = new DefaultResourceLoader({
        cwd: options.repoRoot,
        agentDir: options.env.PI_AGENT_DIR?.trim() || getAgentDir(),
        extensionFactories,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
      });
      await resourceLoader.reload();

      const created = await createAgentSession({
        cwd: options.repoRoot,
        model,
        authStorage,
        modelRegistry,
        sessionManager: SessionManager.inMemory(options.repoRoot),
        resourceLoader,
        tools: ['read', 'grep', 'find', 'ls', 'fetch_merge_request_diff'],
        customTools: [
          createFetchMergeRequestDiffToolDefinition({
            client: options.gitlab,
            expectedRequest: {
              projectId: options.request.gitlab.projectId,
              mergeRequestIid: options.request.gitlab.mergeRequestIid,
            },
          }),
        ],
      });
      session = created.session;

      const snapshotPath =
        options.env.SYNAPSE_PI_HARNESS_PROGRESS_SNAPSHOT?.trim() ?? '';
      const emitProgressLine =
        options.progressEmitLine ??
        ((line: string) => {
          process.stderr.write(`${line}\n`);
        });
      const unsubProgress = subscribePiHarnessProgress(session, {
        enabled: isPiHarnessProgressEnabled(options.env),
        emitLine: snapshotPath !== '' ? () => {} : emitProgressLine,
        snapshotPath: snapshotPath !== '' ? snapshotPath : undefined,
        repoRoot: options.repoRoot,
        now: options.now,
      });

      try {
        await session.prompt(options.request.prompt);
      } finally {
        unsubProgress();
      }

      const lastAssistant = findLastAssistantMessage(session.messages);
      if (
        lastAssistant?.stopReason === 'error' ||
        lastAssistant?.stopReason === 'aborted'
      ) {
        throw new PiReviewFailedError(
          lastAssistant.errorMessage ??
            `Pi assistant ${lastAssistant.stopReason}`,
          1,
        );
      }

      const markdown = extractLastAssistantMarkdown(session.messages);
      if (markdown.trim() === '') {
        throw new PiReviewFailedError('Pi SDK review produced empty output', 1);
      }

      const durationMs = options.now() - started;
      const stdoutBytes = Buffer.byteLength(markdown, 'utf8');
      options.metrics?.recordAdapter({
        adapter: 'pi',
        operation: 'review_pr',
        result: 'success',
      });
      return {
        markdown,
        command: PI_REVIEW_SDK_COMMAND,
        cwd: options.repoRoot,
        exitCode: 0,
        durationMs,
        stdoutBytes,
        stderrBytes: 0,
      };
    } catch (error) {
      options.metrics?.recordAdapter({
        adapter: 'pi',
        operation: 'review_pr',
        result: 'failure',
      });
      throw error;
    } finally {
      session?.dispose();
    }
  };

  if (options.tracer === undefined) {
    return run();
  }

  return runWithRuntimeSpan({
    tracer: options.tracer,
    hop: 'adapter.request',
    adapter: 'pi',
    operation: 'review_pr',
    run,
  });
}

function findLastAssistantMessage(
  messages: AgentMessage[],
): AssistantMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (
      m !== undefined &&
      typeof m === 'object' &&
      'role' in m &&
      m.role === 'assistant'
    ) {
      return m as AssistantMessage;
    }
  }
  return undefined;
}

function extractLastAssistantMarkdown(messages: AgentMessage[]): string {
  const assistant = findLastAssistantMessage(messages);
  if (assistant === undefined) {
    return '';
  }
  const parts: string[] = [];
  for (const block of assistant.content) {
    if (block.type === 'text') {
      parts.push((block as TextContent).text);
    }
  }
  return parts.join('').trim();
}
