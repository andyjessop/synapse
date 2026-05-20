import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

import { gitLabMrChangesSchema } from './schemas.js';

/** Repo-root-relative JSON Schema path for GitLab adapter fixture documents. */
export const GITLAB_ADAPTER_FIXTURE_SCHEMA_PATH =
  'adapters/adapter-gitlab/schemas/gitlab.fetchChanges.v1.schema.json' as const;

const adapterFixtureDocumentBaseSchema = z
  .object({
    version: z.literal(1),
    schema: z.string().min(1),
    adapter: z.string().min(1),
    method: z.string().min(1),
    match: z.record(z.string(), z.unknown()),
    response: z.unknown(),
  })
  .strict();

export const gitlabFetchChangesAdapterFixtureSchema =
  adapterFixtureDocumentBaseSchema.extend({
    schema: z.literal(GITLAB_ADAPTER_FIXTURE_SCHEMA_PATH),
    adapter: z.literal('gitlab'),
    method: z.literal('fetchChanges'),
    response: gitLabMrChangesSchema,
  });

export type GitlabFetchChangesAdapterFixture = z.infer<
  typeof gitlabFetchChangesAdapterFixtureSchema
>;

export function parseGitlabAdapterFixtureJson(
  json: unknown,
): GitlabFetchChangesAdapterFixture {
  const schemaPath = adapterFixtureDocumentBaseSchema.parse(json).schema;
  if (schemaPath !== GITLAB_ADAPTER_FIXTURE_SCHEMA_PATH) {
    throw new Error(
      `Expected GitLab adapter fixture schema ${GITLAB_ADAPTER_FIXTURE_SCHEMA_PATH}, got ${schemaPath}`,
    );
  }
  return gitlabFetchChangesAdapterFixtureSchema.parse(json);
}

export function assertGitlabFixtureSchemaFileExists(
  repoRoot: string,
  schemaPath: string = GITLAB_ADAPTER_FIXTURE_SCHEMA_PATH,
): void {
  const abs = join(repoRoot, schemaPath);
  if (!existsSync(abs)) {
    throw new Error(
      `GitLab adapter fixture JSON Schema not found: ${schemaPath}`,
    );
  }
}

export function loadGitlabAdapterFixtureFile(
  repoRoot: string,
  fixturePath: string,
): GitlabFetchChangesAdapterFixture {
  const raw = JSON.parse(
    readFileSync(join(repoRoot, fixturePath), 'utf8'),
  ) as unknown;
  const parsed = parseGitlabAdapterFixtureJson(raw);
  assertGitlabFixtureSchemaFileExists(repoRoot, parsed.schema);
  return parsed;
}

/** Returns true when every key in `match` equals the corresponding request field. */
export function gitlabAdapterFixtureMatchSatisfies(
  match: Record<string, unknown>,
  request: Record<string, unknown>,
): boolean {
  for (const [key, expected] of Object.entries(match)) {
    if (request[key] !== expected) {
      return false;
    }
  }
  return true;
}

export function findGitlabAdapterFixtureMatch(
  rules: readonly GitlabFetchChangesAdapterFixture[],
  request: Record<string, unknown>,
): GitlabFetchChangesAdapterFixture | undefined {
  return rules.find((rule) =>
    gitlabAdapterFixtureMatchSatisfies(rule.match, request),
  );
}
