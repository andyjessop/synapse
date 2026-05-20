import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  consumeScenarioAdapterFixture,
  createScenarioAdapterConsumptionState,
  resolveFixtureValueJson,
} from '../../src/scenario/scenario-adapter-match.js';
import { stableJsonEqual } from '../../src/scenario/stable-json.js';

const repoRoot = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../..',
);

describe('scenario-adapter-match', () => {
  it('resolveFixtureValueJson reads repo-relative file', () => {
    const value = resolveFixtureValueJson(repoRoot, {
      file: 'fixtures/example-agent-echo/ping.json',
    }) as { message?: string };
    expect(value.message).toBe('hello from fixture');
  });

  it('stableJsonEqual treats object key order as equivalent', () => {
    expect(stableJsonEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it('consumeScenarioAdapterFixture matches source method and params with deep equality', () => {
    const state = createScenarioAdapterConsumptionState({
      scenarioId: 'example/echo-poll',
      adapters: [
        {
          source: 'synapse.poll.example-in-memory-heartbeat.v1',
          method: 'listCandidates',
          params: { query: { status: 'open' } },
          returns: { data: [{ message: 'x' }] },
        },
      ],
    });
    const fixture = consumeScenarioAdapterFixture(state, {
      source: 'synapse.poll.example-in-memory-heartbeat.v1',
      method: 'listCandidates',
      params: { query: { status: 'open' } },
    });
    expect(fixture.returns).toEqual({ data: [{ message: 'x' }] });
  });

  it('consumes duplicate adapter fixtures FIFO for identical source/method/params', () => {
    const state = createScenarioAdapterConsumptionState({
      scenarioId: 'example/state-change',
      adapters: [
        {
          source: 'synapse.poll.example-in-memory-heartbeat.v1',
          method: 'listCandidates',
          params: { status: 'open' },
          returns: { data: [] },
        },
        {
          source: 'synapse.poll.example-in-memory-heartbeat.v1',
          method: 'listCandidates',
          params: { status: 'open' },
          returns: { data: [{ message: '1' }] },
        },
      ],
    });

    const first = consumeScenarioAdapterFixture(state, {
      source: 'synapse.poll.example-in-memory-heartbeat.v1',
      method: 'listCandidates',
      params: { status: 'open' },
    });
    const second = consumeScenarioAdapterFixture(state, {
      source: 'synapse.poll.example-in-memory-heartbeat.v1',
      method: 'listCandidates',
      params: { status: 'open' },
    });

    expect(first.returns).toEqual({ data: [] });
    expect(second.returns).toEqual({ data: [{ message: '1' }] });
  });

  it('throws when adapter fixtures are exhausted', () => {
    const state = createScenarioAdapterConsumptionState({
      scenarioId: 'example/exhausted',
      adapters: [
        {
          source: 'synapse.poll.example-in-memory-heartbeat.v1',
          method: 'listCandidates',
          params: {},
          returns: { data: [] },
        },
      ],
    });
    consumeScenarioAdapterFixture(state, {
      source: 'synapse.poll.example-in-memory-heartbeat.v1',
      method: 'listCandidates',
      params: {},
    });
    expect(() =>
      consumeScenarioAdapterFixture(state, {
        source: 'synapse.poll.example-in-memory-heartbeat.v1',
        method: 'listCandidates',
        params: {},
      }),
    ).toThrow(/exhausted/);
  });
});
