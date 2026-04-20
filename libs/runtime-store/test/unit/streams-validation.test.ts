import { describe, expect, it, vi } from 'vitest';
import { appendEvent } from '../../src/index';

describe('appendEvent validation', () => {
  it('rejects non-JSON-serializable payloads without querying', async () => {
    const query = vi.fn();
    const pool = { query } as never;
    const circular = {} as Record<string, unknown>;
    circular.self = circular;
    await expect(
      appendEvent(pool, {
        type: 'example.ping.v1',
        data: circular,
        source: 'synapse://test',
        externalId: 'ext-2',
      }),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects oversized string fields and payloads before querying', async () => {
    const query = vi.fn();
    const pool = { query } as never;
    await expect(
      appendEvent(pool, {
        type: 'x'.repeat(201),
        data: {},
        source: 'synapse://test',
        externalId: 'ext-3',
      }),
    ).rejects.toThrow(/type/);
    await expect(
      appendEvent(pool, {
        type: 'example.ping.v1',
        data: { blob: 'x'.repeat(1024 * 1024 + 1) },
        source: 'synapse://test',
        externalId: 'ext-4',
      }),
    ).rejects.toThrow(/1 MiB/);
    expect(query).not.toHaveBeenCalled();
  });
});
