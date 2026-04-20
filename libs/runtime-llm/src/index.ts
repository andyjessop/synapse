import { readFile } from 'node:fs/promises';

import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai';
import type { Tracer } from '@opentelemetry/api';
import { generateText, type LanguageModel } from 'ai';
import { type RuntimeMetrics, runWithRuntimeSpan } from 'runtime-observability';
import { z } from 'zod';

export const runtimeLlmPackageName = 'runtime-llm';

export const liveLlmConfigSchema = z
  .object({
    mode: z.literal('live'),
    provider: z.literal('openai').default('openai'),
    model: z.string().min(1),
    apiKey: z.string().min(1),
    baseURL: z.string().url().optional(),
  })
  .strict();

export const fixtureLlmConfigSchema = z
  .object({
    mode: z.literal('fixture'),
    fixtureFile: z.string().min(1),
    fixtureKey: z.string().min(1).default('default'),
  })
  .strict();

export const llmClientConfigSchema = z.discriminatedUnion('mode', [
  liveLlmConfigSchema,
  fixtureLlmConfigSchema,
]);

export type LlmClientConfig = z.input<typeof llmClientConfigSchema>;

export type LlmGenerateRequest = {
  prompt: string;
  system?: string;
};

export type LlmGenerateResult = {
  text: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  finishReason?: string;
};

export type LlmClient = {
  generateText(request: LlmGenerateRequest): Promise<LlmGenerateResult>;
};

export type LlmTelemetry = {
  tracer?: Tracer;
  metrics?: RuntimeMetrics;
};

/** OpenAI surface used by the live path (`createOpenAI` is assignable here). */
export type OpenAiLlmSurface = Pick<OpenAIProvider, 'responses'>;

type GenerateTextDependency = (input: {
  model: LanguageModel;
  prompt: string;
  system?: string;
}) => Promise<{
  text: string;
  usage?: LlmGenerateResult['usage'];
  finishReason?: string;
}>;

export type LlmClientDependencies = {
  createOpenAI?: (settings: {
    apiKey: string;
    baseURL?: string;
  }) => OpenAiLlmSurface;
  generateText?: GenerateTextDependency;
};

export function createLlmClient(
  config: LlmClientConfig,
  telemetry: LlmTelemetry = {},
  dependencies: LlmClientDependencies = {},
): LlmClient {
  const parsed = llmClientConfigSchema.parse(config);
  if (parsed.mode === 'fixture') {
    return new FakeLlmClient(parsed, telemetry);
  }

  /* v8 ignore next -- live default provider is exercised by integration wiring, not unit tests. */
  const openai = (dependencies.createOpenAI ?? createOpenAI)({
    apiKey: parsed.apiKey,
    ...(parsed.baseURL === undefined ? {} : { baseURL: parsed.baseURL }),
  });
  const model = openai.responses(parsed.model);
  /* v8 ignore next -- unit tests inject the AI SDK primitive to stay offline. */
  const generate = dependencies.generateText ?? generateText;

  return {
    generateText: (request) =>
      callWithLlmTelemetry(telemetry, async () => {
        const result = await generate({
          model,
          prompt: request.prompt,
          ...(request.system === undefined ? {} : { system: request.system }),
        });
        return {
          text: result.text,
          ...(result.usage === undefined ? {} : { usage: result.usage }),
          ...(result.finishReason === undefined
            ? {}
            : { finishReason: result.finishReason }),
        };
      }),
  };
}

export class FakeLlmClient implements LlmClient {
  private readonly parsedConfig: z.infer<typeof fixtureLlmConfigSchema>;

  constructor(
    config: z.input<typeof fixtureLlmConfigSchema>,
    private readonly telemetry: LlmTelemetry = {},
  ) {
    this.parsedConfig = fixtureLlmConfigSchema.parse(config);
  }

  async generateText(request: LlmGenerateRequest): Promise<LlmGenerateResult> {
    return callWithLlmTelemetry(this.telemetry, async () => {
      const fixture = fakeLlmFixtureSchema.parse(
        JSON.parse(await readFile(this.parsedConfig.fixtureFile, 'utf8')),
      );
      const entry = fixture.responses[this.parsedConfig.fixtureKey];
      if (entry === undefined) {
        throw new Error(
          `Missing LLM fixture response: ${this.parsedConfig.fixtureKey}`,
        );
      }
      return entry;
    });
  }
}

const fakeLlmFixtureSchema = z
  .object({
    responses: z.record(
      z.string(),
      z
        .object({
          text: z.string(),
          usage: z
            .object({
              inputTokens: z.number().int().nonnegative().optional(),
              outputTokens: z.number().int().nonnegative().optional(),
              totalTokens: z.number().int().nonnegative().optional(),
            })
            .strict()
            .optional(),
          finishReason: z.string().min(1).optional(),
        })
        .strict(),
    ),
  })
  .strict();

async function callWithLlmTelemetry(
  telemetry: LlmTelemetry,
  run: () => Promise<LlmGenerateResult>,
): Promise<LlmGenerateResult> {
  const execute = async () => {
    try {
      const result = await run();
      telemetry.metrics?.recordAdapter({
        adapter: runtimeLlmPackageName,
        operation: 'generate_text',
        result: 'success',
      });
      return result;
    } catch (error) {
      telemetry.metrics?.recordAdapter({
        adapter: runtimeLlmPackageName,
        operation: 'generate_text',
        result: 'failure',
      });
      throw error;
    }
  };

  if (telemetry.tracer === undefined) {
    return execute();
  }

  // LLM calls share the `adapter.request` hop and adapter counters with other
  // external IO: the model provider is an outbound integration boundary.
  return runWithRuntimeSpan({
    tracer: telemetry.tracer,
    hop: 'adapter.request',
    adapter: runtimeLlmPackageName,
    operation: 'generate_text',
    run: execute,
  });
}
