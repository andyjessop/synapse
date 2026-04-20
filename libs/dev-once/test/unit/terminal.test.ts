import type { SynapseFixture } from 'synapse-fixtures';
import { describe, expect, it } from 'vitest';
import { evaluateExpectFromTypes } from '../../src/terminal.js';

describe('fixture expect evaluation', () => {
  const fixture: SynapseFixture = {
    version: 1,
    id: 'example/echo',
    title: 'Echo',
    agent: 'example-echo',
    ingress: {
      kind: 'webhook',
      method: 'POST',
      path: '/v1/examples/echo/ping',
      body: { file: 'examples/fixtures/example-agent-echo/ping.json' },
    },
    expect: {
      terminalEventTypes: ['example.pong.v1'],
    },
  };

  it('fails when terminal type missing', () => {
    const result = evaluateExpectFromTypes(
      fixture,
      new Set(['example.ping.v1']),
      false,
    );
    expect(result.kind).toBe('failed');
  });

  it('succeeds when terminal type present and no failed runs', () => {
    const result = evaluateExpectFromTypes(
      fixture,
      new Set(['example.ping.v1', 'example.pong.v1']),
      false,
    );
    expect(result.kind).toBe('succeeded');
  });
});
