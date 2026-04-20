import { describe, expect, it, vi } from 'vitest';

import { waitForFixtureTerminal } from '../../src/terminal.js';

describe('waitForFixtureTerminal onPollTick', () => {
  it('invokes onPollTick each poll iteration', async () => {
    const onPollTick = vi.fn();
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }),
    };

    await waitForFixtureTerminal({
      pool: pool as never,
      rootId: 'root-1',
      fixture: {
        version: 1,
        id: 'x',
        title: 'x',
        agent: 'a',
        ingress: {} as never,
      },
      pollMs: 0,
      timeoutMs: 50,
      onPollTick,
    });

    expect(onPollTick.mock.calls.length).toBeGreaterThan(0);
  });
});
