import type { Tracer } from '@opentelemetry/api';
import { type RuntimeMetrics, runWithRuntimeSpan } from 'runtime-observability';
import type { GitLabMergeRequestClient } from './client.js';
import {
  findGitlabAdapterFixtureMatch,
  type GitlabFetchChangesAdapterFixture,
} from './fixtures.js';
import type { GitLabMrChanges } from './schemas.js';

export type CreateGitLabMergeRequestMockClientInput = {
  rules: readonly GitlabFetchChangesAdapterFixture[];
  tracer?: Tracer;
  metrics?: RuntimeMetrics;
};

export function createGitLabMergeRequestMockClient(
  input: CreateGitLabMergeRequestMockClientInput,
): GitLabMergeRequestClient {
  return {
    fetchChanges: async (request) => {
      const run = async (): Promise<GitLabMrChanges> => {
        const rule = findGitlabAdapterFixtureMatch(input.rules, {
          projectId: request.projectId,
          mergeRequestIid: request.mergeRequestIid,
          ...(request.mergeRequestId !== undefined
            ? { mergeRequestId: request.mergeRequestId }
            : {}),
        });
        if (rule === undefined) {
          throw new Error(
            `No adapter fixture match for gitlab.fetchChanges (projectId=${request.projectId}, mergeRequestIid=${request.mergeRequestIid}). Loaded ${input.rules.length} rule(s).`,
          );
        }
        input.metrics?.recordAdapter({
          adapter: 'gitlab',
          operation: 'fetch_mr_changes',
          result: 'success',
        });
        return rule.response;
      };

      try {
        if (input.tracer === undefined) {
          return await run();
        }
        return await runWithRuntimeSpan({
          tracer: input.tracer,
          hop: 'adapter.request',
          adapter: 'gitlab',
          operation: 'fetch_mr_changes',
          run,
        });
      } catch (error) {
        input.metrics?.recordAdapter({
          adapter: 'gitlab',
          operation: 'fetch_mr_changes',
          result: 'failure',
        });
        throw error;
      }
    },
  };
}
