import { describe, expect, it } from 'vitest';
import {
  type PollRunError,
  type PollTickSummary,
  pollRunErrorBodySchema,
  pollTickSummarySchema,
} from '../../src/polling/poll-http-schemas.js';

describe('poll HTTP schema types', () => {
  it('PollTickSummary matches pollTickSummarySchema', () => {
    const summary: PollTickSummary = pollTickSummarySchema.parse({
      sourceId: 'synapse.poll.example-in-memory-heartbeat.v1',
      emitted: 1,
      skipped: 0,
      failed: 0,
      durationMs: 10,
      rootEventIds: ['evt-1'],
    });
    expect(summary.rootEventIds).toEqual(['evt-1']);
  });

  it('PollRunError matches pollRunErrorBodySchema', () => {
    const error: PollRunError = pollRunErrorBodySchema.parse({
      code: 'not_found',
      message: 'Poll source not available',
    });
    expect(error.code).toBe('not_found');
  });
});
