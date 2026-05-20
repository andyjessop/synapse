import { GitLabApiError, type GitLabMergeRequestClient } from './client.js';
import { gitLabMrChangesSchema } from './schemas.js';

export type CreateGitLabMergeRequestLiveClientInput = {
  baseUrl?: string;
  token: string;
};

export function createGitLabMergeRequestLiveClient(
  input: CreateGitLabMergeRequestLiveClientInput,
): GitLabMergeRequestClient {
  const baseUrl = (input.baseUrl ?? 'https://gitlab.com').replace(/\/$/, '');

  return {
    fetchChanges: async (request) => {
      const url = `${baseUrl}/api/v4/projects/${request.projectId}/merge_requests/${request.mergeRequestIid}/changes`;
      const response = await fetch(url, {
        headers: {
          'PRIVATE-TOKEN': input.token,
          accept: 'application/json',
        },
      });
      if (!response.ok) {
        throw new GitLabApiError(
          `GitLab API ${response.status} for ${url}`,
          response.status,
        );
      }
      const json = (await response.json()) as Record<string, unknown>;
      return gitLabMrChangesSchema.parse({
        project_id: request.projectId,
        merge_request_iid: request.mergeRequestIid,
        ...(request.mergeRequestId !== undefined
          ? { merge_request_id: request.mergeRequestId }
          : {}),
        changes: json.changes ?? [],
      });
    },
  };
}
