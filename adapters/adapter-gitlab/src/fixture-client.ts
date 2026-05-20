import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Tracer } from '@opentelemetry/api';
import { type RuntimeMetrics, runWithRuntimeSpan } from 'runtime-observability';

import type { GitLabMergeRequestClient } from './client.js';
import { gitLabMrChangesSchema } from './schemas.js';

export type CreateGitLabMergeRequestFixtureClientInput = {
  repoRoot: string;
  /** Repo-root-relative path to flat MR changes JSON (see gitLabMrChangesSchema) */
  changesFile: string;
  tracer?: Tracer;
  metrics?: RuntimeMetrics;
};

export function createGitLabMergeRequestFixtureClient(
  input: CreateGitLabMergeRequestFixtureClientInput,
): GitLabMergeRequestClient {
  const fixturePath = join(input.repoRoot, input.changesFile);

  return {
    fetchChanges: async (request) => {
      const run = async () => {
        const raw = await readFile(fixturePath, 'utf8');
        const parsed = gitLabMrChangesSchema.parse(JSON.parse(raw));
        if (
          parsed.project_id !== request.projectId ||
          parsed.merge_request_iid !== request.mergeRequestIid
        ) {
          // Fixture mode: serve static bytes regardless of ids (debug only).
        }
        input.metrics?.recordAdapter({
          adapter: 'gitlab',
          operation: 'fetch_mr_changes',
          result: 'success',
        });
        return parsed;
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
