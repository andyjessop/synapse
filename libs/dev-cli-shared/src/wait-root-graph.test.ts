import type { RuntimePool } from 'runtime-store';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('runtime-store', async (importOriginal) => {
  const mod = await importOriginal<typeof import('runtime-store')>();
  return {
    ...mod,
    queryEvents: vi.fn().mockResolvedValue([]),
  };
});

import { waitForRootGraphOutcome } from './wait-root-graph.js';

describe('waitForRootGraphOutcome', () => {
  let pool: RuntimePool;

  beforeEach(() => {
    pool = {
      query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
    } as unknown as RuntimePool;
  });

  it('invokes onPollTick at the start of every iteration until maxPolls', async () => {
    const onPollTick = vi.fn();
    const status = await waitForRootGraphOutcome({
      pool,
      rootId: 'root-1',
      terminalEventTypes: ['terminal.example'],
      maxPolls: 3,
      pollMs: 0,
      onPollTick,
    });
    expect(status).toBe('running');
    expect(onPollTick).toHaveBeenCalledTimes(3);
  });
});
