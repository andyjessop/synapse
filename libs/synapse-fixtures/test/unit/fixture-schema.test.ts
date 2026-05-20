import { WEBHOOK_FIXTURE_SCHEMA_PATHS } from 'runtime-manifest';
import { describe, expect, it } from 'vitest';
import { parseSynapseFixtureJson } from '../../src/index.js';

describe('synapse fixtures', () => {
  it('parses legacy webhook run-loop fixture JSON', () => {
    const fixture = parseSynapseFixtureJson({
      version: 1,
      schema: WEBHOOK_FIXTURE_SCHEMA_PATHS.RUN_LOOP,
      id: 'example/echo',
      title: 'Echo',
      agent: 'example-echo',
      ingress: {
        kind: 'webhook',
        method: 'POST',
        path: '/v1/example/echo',
        body: { file: 'fixtures/example-agent-echo/ping.json' },
      },
      expect: { terminalEventTypes: ['example.pong.v1'] },
    });
    expect(fixture.id).toBe('example/echo');
    expect(fixture.ingress.kind).toBe('webhook');
  });
});
