import { describe, expect, it } from 'vitest';
import type { RuntimeManifest } from '../../src/manifest-schema.js';
import {
  fixturePollIngressIsMounted,
  resolveManifestPollSources,
} from '../../src/poll-source-catalog.js';

const baseManifest: RuntimeManifest = {
  version: 1,
  schema: 'libs/runtime-manifest/schemas/manifest/runtime.v1.schema.json',
  name: 'poll-test',
  agents: [{ name: 'example-echo' }],
  pollers: [
    {
      source: 'synapse.poll.example-in-memory-heartbeat.v1',
      intervalMs: 60_000,
    },
  ],
};

describe('poll-source-catalog', () => {
  it('resolves manifest poll sources with effective lock ttl', () => {
    const resolved = resolveManifestPollSources(baseManifest);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.id).toBe('synapse.poll.example-in-memory-heartbeat.v1');
    expect(resolved[0]?.intervalMs).toBe(60_000);
    expect(resolved[0]?.lockTtlMs).toBeLessThan(60_000);
    expect(resolved[0]?.owner).toBe('example-echo');
  });

  it('rejects explicit lockTtlMs >= intervalMs', () => {
    const invalid: RuntimeManifest = {
      ...baseManifest,
      pollers: [
        {
          source: 'synapse.poll.example-in-memory-heartbeat.v1',
          intervalMs: 60_000,
          lockTtlMs: 60_000,
        },
      ],
    };
    expect(() => resolveManifestPollSources(invalid)).toThrow(/lockTtlMs/);
  });

  it('rejects duplicate poll source ids', () => {
    const invalid: RuntimeManifest = {
      ...baseManifest,
      pollers: [
        { source: 'synapse.poll.example-in-memory-heartbeat.v1' },
        { source: 'synapse.poll.example-in-memory-heartbeat.v1' },
      ],
    };
    expect(() => resolveManifestPollSources(invalid)).toThrow(/Duplicate/);
  });

  it('rejects poll source when owner agent is missing from manifest', () => {
    const invalid: RuntimeManifest = {
      ...baseManifest,
      agents: [],
    };
    expect(() => resolveManifestPollSources(invalid)).toThrow(/owner/);
  });

  it('fixturePollIngressIsMounted respects enabled flag', () => {
    const disabled: RuntimeManifest = {
      ...baseManifest,
      pollers: [
        {
          source: 'synapse.poll.example-in-memory-heartbeat.v1',
          enabled: false,
        },
      ],
    };
    expect(
      fixturePollIngressIsMounted(
        { source: 'synapse.poll.example-in-memory-heartbeat.v1' },
        disabled,
      ),
    ).toBe(false);
    expect(
      fixturePollIngressIsMounted(
        { source: 'synapse.poll.example-in-memory-heartbeat.v1' },
        baseManifest,
      ),
    ).toBe(true);
  });
});
