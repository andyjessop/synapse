import { join } from 'node:path';
import type { LanguageModel } from 'ai';
import { getRepoRoot } from 'runtime-config';
import {
  getFinishedSpans,
  initializeObservability,
} from 'runtime-observability';
import { describe, expect, it, vi } from 'vitest';
import {
  createLlmClient,
  FakeLlmClient,
  fixtureLlmConfigSchema,
  liveLlmConfigSchema,
  llmClientConfigSchema,
  type OpenAiLlmSurface,
  runtimeLlmPackageName,
} from '../../src/index';

const fixtureFile = join(
  getRepoRoot(import.meta.url),
  'fixtures/runtime-llm/responses.json',
);

describe('runtime-llm', () => {
  it('validates live and fixture configs', () => {
    expect(
      liveLlmConfigSchema.parse({
        mode: 'live',
        model: 'gpt-5.5',
        apiKey: 'key',
      }),
    ).toMatchObject({ provider: 'openai' });
    expect(
      llmClientConfigSchema.parse({
        mode: 'fixture',
        fixtureFile,
      }),
    ).toMatchObject({ fixtureKey: 'default' });
    expect(() =>
      fixtureLlmConfigSchema.parse({ mode: 'fixture', fixtureFile: '' }),
    ).toThrow();
  });

  it('returns deterministic fixture responses from JSON', async () => {
    const client = new FakeLlmClient({ mode: 'fixture', fixtureFile });

    await expect(client.generateText({ prompt: 'ignored' })).resolves.toEqual({
      text: '{"ok":true}',
      usage: {
        inputTokens: 2,
        outputTokens: 3,
        totalTokens: 5,
      },
      finishReason: 'stop',
    });
  });

  it('wraps live AI SDK calls with OpenAI responses and telemetry', async () => {
    const obs = initializeObservability({
      serviceName: 'runtime-llm-test',
      mode: 'test',
      registerGlobal: false,
    });
    const createOpenAI = vi.fn(
      () =>
        ({
          responses: vi.fn(
            (model: string) => ({ model }) as unknown as LanguageModel,
          ),
        }) as OpenAiLlmSurface,
    );
    const generateText = vi.fn(async () => ({
      text: 'generated',
      usage: { totalTokens: 1 },
      finishReason: 'stop',
    }));
    const client = createLlmClient(
      {
        mode: 'live',
        model: 'gpt-5.5',
        apiKey: 'key',
        baseURL: 'https://api.example.test/v1',
      },
      { tracer: obs.tracer, metrics: obs.metrics },
      { createOpenAI, generateText },
    );

    await expect(
      client.generateText({ prompt: 'hello', system: 'system' }),
    ).resolves.toMatchObject({
      text: 'generated',
      finishReason: 'stop',
    });
    expect(createOpenAI).toHaveBeenCalledWith({
      apiKey: 'key',
      baseURL: 'https://api.example.test/v1',
    });
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { model: 'gpt-5.5' },
        prompt: 'hello',
        system: 'system',
      }),
    );
    expect(getFinishedSpans(obs)).toHaveLength(1);
    expect(getFinishedSpans(obs)[0]?.attributes).toMatchObject({
      'synapse.adapter': runtimeLlmPackageName,
      'synapse.operation': 'generate_text',
    });
    await obs.shutdown();
  });

  it('omits optional live settings when absent', async () => {
    const createOpenAI = vi.fn(
      () =>
        ({
          responses: vi.fn(
            (model: string) => ({ model }) as unknown as LanguageModel,
          ),
        }) as OpenAiLlmSurface,
    );
    const generateText = vi.fn(async () => ({ text: 'minimal' }));
    const client = createLlmClient(
      {
        mode: 'live',
        model: 'gpt-5.5',
        apiKey: 'key',
      },
      {},
      { createOpenAI, generateText },
    );

    await expect(client.generateText({ prompt: 'hello' })).resolves.toEqual({
      text: 'minimal',
    });
    expect(createOpenAI).toHaveBeenCalledWith({ apiKey: 'key' });
    expect(generateText).toHaveBeenCalledWith({
      model: { model: 'gpt-5.5' },
      prompt: 'hello',
    });
  });

  it('records failed fixture calls through telemetry', async () => {
    const obs = initializeObservability({
      serviceName: 'runtime-llm-test',
      mode: 'test',
      registerGlobal: false,
    });
    const client = createLlmClient(
      {
        mode: 'fixture',
        fixtureFile,
        fixtureKey: 'missing',
      },
      { tracer: obs.tracer, metrics: obs.metrics },
    );

    await expect(client.generateText({ prompt: 'x' })).rejects.toThrow(
      /Missing LLM fixture response/,
    );
    expect(getFinishedSpans(obs)[0]?.status.message).toContain(
      'Missing LLM fixture response',
    );
    await obs.shutdown();
  });
});
