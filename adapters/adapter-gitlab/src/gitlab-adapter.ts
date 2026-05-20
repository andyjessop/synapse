import { defineAdapterSource } from 'runtime-adapters';

import type { GitLabMergeRequestClient } from './client.js';
import { createGitLabMergeRequestLiveClient } from './live-client.js';
import { gitlabFetchChangesMethod } from './methods/fetch-changes.js';

type GitlabAdapterLiveDeps = {
  gitlabClient: GitLabMergeRequestClient;
};

export const gitlabAdapter = defineAdapterSource({
  source: 'synapse.adapters.gitlab.v1',
  description: 'GitLab merge request IO',
  createLiveDeps(env): GitlabAdapterLiveDeps | undefined {
    const token = env.GITLAB_TOKEN?.trim();
    if (token === undefined || token === '') {
      return undefined;
    }
    return {
      gitlabClient: createGitLabMergeRequestLiveClient({
        token,
        ...(env.GITLAB_BASE_URL?.trim()
          ? { baseUrl: env.GITLAB_BASE_URL.trim() }
          : {}),
      }),
    };
  },
  methods: {
    fetchChanges: gitlabFetchChangesMethod,
  },
});
