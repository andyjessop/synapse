import { describe, expect, it } from 'vitest';

import { reviewPrAgent } from '../../src/review-pr-agent.definition.js';

describe('reviewPrAgent definition', () => {
  it('declares agent-reviewer handles and adapter dependency', () => {
    expect(reviewPrAgent.name).toBe('agent-reviewer');
    expect(reviewPrAgent.handles).toEqual(['pr.received.v1']);
    expect(reviewPrAgent.usesAdapters).toEqual(['synapse.adapters.gitlab.v1']);
    expect(typeof reviewPrAgent.run).toBe('function');
  });
});
