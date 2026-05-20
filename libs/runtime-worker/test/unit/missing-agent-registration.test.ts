import { describe, expect, it } from 'vitest';

import { shouldDeferRunToOtherWorker } from '../../src/missing-agent-registration.js';

describe('shouldDeferRunToOtherWorker', () => {
  it('defers when the agent is absent from this worker manifest', () => {
    expect(
      shouldDeferRunToOtherWorker(
        new Error('Missing agent registration: agent-reviewer'),
      ),
    ).toBe(true);
    expect(
      shouldDeferRunToOtherWorker(
        new Error(
          'Missing agent registration: agent-reviewer (manifest example-echo)',
        ),
      ),
    ).toBe(true);
  });

  it('does not defer when the reactor name is wrong on this worker', () => {
    expect(
      shouldDeferRunToOtherWorker(
        new Error('Missing agent registration: agent/missing'),
      ),
    ).toBe(false);
  });
});
