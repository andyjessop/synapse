import { createOpenAI } from '@ai-sdk/openai';
import { describe, expect, it } from 'vitest';

/**
 * Guards the live seam against @ai-sdk/openai API drift: `createLlmClient` relies on
 * `createOpenAI(...).responses(modelId)` (Responses API). Mocks in client.test.ts would not catch removal.
 */
describe('@ai-sdk/openai surface for runtime-llm live path', () => {
  it('exposes responses(modelId) without calling the network', () => {
    const openai = createOpenAI({ apiKey: 'test-key-not-used-for-network' });
    const model = openai.responses('gpt-4o-mini');
    expect(model).toBeDefined();
    expect(typeof model).toBe('object');
  });
});
