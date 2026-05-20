import type { GitLabMrChanges } from './schemas.js';

export type GitLabMergeRequestChangesRequest = {
  projectId: number;
  mergeRequestIid: number;
  mergeRequestId?: number;
};

export type GitLabMergeRequestClient = {
  fetchChanges(
    request: GitLabMergeRequestChangesRequest,
  ): Promise<GitLabMrChanges>;
};

export class GitLabApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GitLabApiError';
  }
}
