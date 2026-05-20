import {
  type GitLabMergeRequestClient,
  gitLabMrChangesSchema,
} from 'adapter-gitlab';
import { type AdapterPort, invokeAdapter } from 'runtime-adapters';

export type {
  GitLabMergeRequestChangesRequest,
  GitLabMergeRequestClient,
  GitLabMrChanges,
} from 'adapter-gitlab';

/** Build a GitLab MR client that calls `ctx.adapters` (no live GitLab SDK in the agent). */
export function createGitLabMergeRequestClientFromAdapterPort(
  port: AdapterPort,
  agentName: string,
): GitLabMergeRequestClient {
  return {
    fetchChanges: async (request) => {
      const result = await invokeAdapter(port, {
        agentName,
        source: 'synapse.adapters.gitlab.v1',
        method: 'fetchChanges',
        params: {
          projectId: request.projectId,
          mergeRequestIid: request.mergeRequestIid,
          ...(request.mergeRequestId !== undefined
            ? { mergeRequestId: request.mergeRequestId }
            : {}),
        },
      });
      return gitLabMrChangesSchema.parse(result);
    },
  };
}
