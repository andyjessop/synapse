import { defineAgent } from 'runtime-agent';

import runReviewPrAgent from './review-pr-agent.js';

export const reviewPrAgent = defineAgent({
  name: 'agent-reviewer',
  handles: ['pr.received.v1'],
  usesAdapters: ['synapse.adapters.gitlab.v1'],
  run: runReviewPrAgent,
});
