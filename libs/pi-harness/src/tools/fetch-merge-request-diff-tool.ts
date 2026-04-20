import { defineTool } from '@earendil-works/pi-coding-agent';
import type {
  GitLabMergeRequestChangesRequest,
  GitLabMergeRequestClient,
} from 'adapter-gitlab';
import { Type } from 'typebox';

import { formatMrChangesAsMarkdown } from './format-mr-changes-markdown.js';

const fetchMergeRequestDiffSchema = Type.Object(
  {
    project_id: Type.Number({ description: 'GitLab project id' }),
    merge_request_iid: Type.Number({
      description: 'GitLab merge request IID (project-scoped)',
    }),
  },
  { additionalProperties: false },
);

export type FetchMergeRequestDiffExpectedRequest =
  GitLabMergeRequestChangesRequest;

export type CreateFetchMergeRequestDiffToolDefinitionInput = {
  client: GitLabMergeRequestClient;
  expectedRequest: FetchMergeRequestDiffExpectedRequest;
};

export function createFetchMergeRequestDiffToolDefinition(
  input: CreateFetchMergeRequestDiffToolDefinitionInput,
) {
  return defineTool({
    name: 'fetch_merge_request_diff',
    label: 'Fetch MR diff',
    description:
      'Fetch merge request file diffs from GitLab (project_id and merge_request_iid). Call once before writing findings.',
    promptSnippet:
      'fetch_merge_request_diff(project_id, merge_request_iid) — authoritative MR code changes',
    parameters: fetchMergeRequestDiffSchema,
    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      if (
        params.project_id !== input.expectedRequest.projectId ||
        params.merge_request_iid !== input.expectedRequest.mergeRequestIid
      ) {
        throw new Error(
          `fetch_merge_request_diff args must match review context (expected project_id=${input.expectedRequest.projectId}, merge_request_iid=${input.expectedRequest.mergeRequestIid})`,
        );
      }
      const changes = await input.client.fetchChanges({
        projectId: params.project_id,
        mergeRequestIid: params.merge_request_iid,
        mergeRequestId: input.expectedRequest.mergeRequestId,
      });
      const markdown = formatMrChangesAsMarkdown(changes);
      return {
        content: [{ type: 'text' as const, text: markdown }],
        details: undefined,
      };
    },
  });
}
