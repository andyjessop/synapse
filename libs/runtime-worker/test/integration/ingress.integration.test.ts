import { randomUUID } from 'node:crypto';
import { selectEventById } from 'runtime-store';
import { describe, expect, it } from 'vitest';
import { createIngressContext } from '../../src/ingress';
import {
  assertNoDuplicateEvents,
  countRows,
  probeIntegrationInfra,
  withIsolatedStreamsStore,
} from './harness';

const integrationAvailable = await probeIntegrationInfra();

describe.skipIf(!integrationAvailable)('runtime-worker ingress context', () => {
  it('emits to the runtime store and dedupes repeated external ids', async () => {
    await withIsolatedStreamsStore(async ({ pool }) => {
      const ctx = createIngressContext({
        agent: 'agent-reviewer',
        source: 'synapse://test/ingress',
        store: pool,
      });
      const externalId = `ingress:${randomUUID()}`;

      const first = await ctx.emit(
        'example.ping.v1',
        { message: 'hello' },
        { externalId, subject: 'subject-1' },
      );
      const second = await ctx.emit(
        'example.ping.v1',
        { message: 'hello' },
        { externalId, subject: 'subject-1' },
      );

      expect(first.id).toBe(second.id);
      expect(await countRows(pool, 'events')).toBe(1);
      const stored = await selectEventById(pool, first.id);
      expect(stored).toMatchObject({
        type: 'example.ping.v1',
        source: 'synapse://test/ingress',
        subject: 'subject-1',
        externalId,
        rootId: first.id,
      });
      await assertNoDuplicateEvents(pool);
    });
  });

  it('rejects unknown event types before writing', async () => {
    await withIsolatedStreamsStore(async ({ pool }) => {
      const ctx = createIngressContext({
        agent: 'agent-reviewer',
        source: 'synapse://test/ingress',
        store: pool,
      });

      await expect(
        ctx.emit(
          'unknown.event.v1',
          { message: 'hello' },
          { externalId: `unknown:${randomUUID()}` },
        ),
      ).rejects.toThrow('Unknown event type');
      expect(await countRows(pool, 'events')).toBe(0);
    });
  });
});
