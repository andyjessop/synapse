import { defineAgentHandler, type SynapseEvent } from 'runtime-agent';
import { configureReviewPrDevClients } from './configure-review-pr-dev-clients.js';
import { createGitLabMergeRequestClientFromAdapterPort } from './gitlab-merge-request-client.js';
import { PiReviewFailedError, type PiReviewRequest } from './pi-review-client';
import { type PrReceivedData, prReceivedDataSchema } from './pr-received-data';
import {
  buildReviewPrPrompt,
  countReviewFindings,
  extractReviewSummary,
  REVIEW_PR_PROMPT_VERSION,
} from './prompt';
import {
  getReviewPrPiClient,
  resetReviewPrPiClientForTest,
  setReviewPrPiClient,
} from './review-pr-pi-injection.js';

export type { PrReceivedData } from './pr-received-data';
export { prReceivedDataSchema } from './pr-received-data';
export {
  resetReviewPrPiClientForTest,
  setReviewPrPiClient,
} from './review-pr-pi-injection.js';

export function reviewPrReviewedExternalId(
  received: PrReceivedData,
  inputEventId: string,
): string {
  return `gitlab:merge-request-review:${received.project.id}:${received.merge_request.id}:${received.merge_request.last_commit_sha}:review-pr.v2:${inputEventId}`;
}

function reviewSubject(data: PrReceivedData): string {
  return `gitlab:${data.project.path_with_namespace}!${data.merge_request.iid}`;
}

const defaultUnconfiguredPi = {
  repoRoot: process.cwd(),
  review: async (request: PiReviewRequest) => {
    throw new PiReviewFailedError(
      `No Pi review client is configured for ${request.subject}`,
      1,
    );
  },
};

export default defineAgentHandler(prReceivedDataSchema, async (ctx, event) => {
  const gitlab = createGitLabMergeRequestClientFromAdapterPort(
    ctx.adapters,
    ctx.agentName,
  );
  configureReviewPrDevClients(process.env, import.meta.url, { gitlab });
  const piReview = getReviewPrPiClient() ?? defaultUnconfiguredPi;
  const data = event.data;
  const repoRoot = piReview.repoRoot;
  const prompt = buildReviewPrPrompt({
    event: { ...event, data } as SynapseEvent<PrReceivedData>,
    repoRoot,
  });
  const subject = event.subject ?? reviewSubject(data);
  const request = {
    repoRoot,
    prompt,
    promptVersion: REVIEW_PR_PROMPT_VERSION,
    subject,
    inputEventId: event.id,
    gitlab: {
      projectId: data.project.id,
      mergeRequestIid: data.merge_request.iid,
    },
    emitHarnessEvent: async (type, harnessData, externalId) => {
      await ctx.emit(type, harnessData, { subject, externalId });
    },
  } satisfies PiReviewRequest;

  const piResult = await piReview.review(request);
  const markdown = piResult.markdown;
  const summary = extractReviewSummary(markdown);
  const findingCount = countReviewFindings(markdown);

  await ctx.emit(
    'pr.reviewed.v1',
    {
      provider: 'gitlab',
      project_path: data.project.path_with_namespace,
      merge_request_iid: data.merge_request.iid,
      merge_request_url: data.merge_request.url,
      input_event_id: event.id,
      review: {
        markdown,
        summary,
        finding_count: findingCount,
      },
      reviewer: {
        agent: 'agent-reviewer',
        reactor: 'review-pr',
        prompt_version: REVIEW_PR_PROMPT_VERSION,
        engine: 'pi',
      },
      pi: {
        command: piResult.command,
        cwd: piResult.cwd,
        exit_code: piResult.exitCode,
        duration_ms: piResult.durationMs,
        stdout_bytes: piResult.stdoutBytes,
        stderr_bytes: piResult.stderrBytes,
      },
    },
    {
      subject,
      externalId: reviewPrReviewedExternalId(data, event.id),
    },
  );
});
