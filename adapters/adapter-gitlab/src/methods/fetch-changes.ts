import { defineAdapterMethod } from 'runtime-adapters';

import type { GitLabMergeRequestClient } from '../client.js';
import {
  gitLabMrChangesSchema,
  gitlabFetchChangesParamsSchema,
} from '../schemas.js';

export type GitlabFetchChangesDeps = {
  gitlabClient: GitLabMergeRequestClient;
};

export const gitlabFetchChangesMethod = defineAdapterMethod({
  source: 'synapse.adapters.gitlab.v1',
  method: 'fetchChanges',
  description: 'Fetch GitLab merge request changes.',
  boundary: {
    reason:
      'Bounded GitLab IO; centralized credentials; FIFO scenario fixtures; may be called from worker (and ingress if needed).',
    scenarioFixtureable: true,
    sharedAcrossProcesses: true,
  },
  paramsSchema: gitlabFetchChangesParamsSchema,
  resultSchema: gitLabMrChangesSchema,
  invokeLive: async (params, deps: GitlabFetchChangesDeps) => {
    return deps.gitlabClient.fetchChanges(params);
  },
});
