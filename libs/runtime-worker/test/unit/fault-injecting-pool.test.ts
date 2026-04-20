import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { createFaultInjectingPool } from '../integration/harness';

describe('createFaultInjectingPool', () => {
  it('restores client.query after an injected fault so later queries use the real implementation', async () => {
    const baseQuery = vi.fn(async (..._args: unknown[]) => ({ rows: [] }));
    const client = { query: baseQuery } as unknown as PoolClient;
    const pool = {
      connect(
        cb?: (err: null, c: PoolClient) => void,
      ): void | Promise<PoolClient> {
        if (typeof cb === 'function') {
          cb(null, client);
          return;
        }
        return Promise.resolve(client);
      },
    };
    const faultPool = createFaultInjectingPool(pool as never, {
      failSqlMatching: /set status = 'queued'/i,
    });
    const c = await faultPool.connect();
    await expect(
      c.query(`
          update agent_runs
          set status = 'queued',
              updated_at = now()
          where id = $1
        `),
    ).rejects.toThrow(/Injected fault/);
    await c.query('select 1');
    expect(baseQuery).toHaveBeenCalled();
  });
});
