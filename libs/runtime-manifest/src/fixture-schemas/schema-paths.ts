/** Repo-root-relative JSON Schema path for runtime manifest files (authoritative in runtime-manifest). */
export const MANIFEST_SCHEMA_PATH =
  'libs/runtime-manifest/schemas/manifest/runtime.v1.schema.json' as const;

export type ManifestSchemaPath = typeof MANIFEST_SCHEMA_PATH;

/** Repo-root-relative JSON Schema paths for webhook fixtures (authoritative in runtime-manifest). */
export const WEBHOOK_FIXTURE_SCHEMA_PATHS = {
  RUN_LOOP: 'libs/runtime-manifest/schemas/webhook/run-loop.v1.schema.json',
} as const;

export type WebhookFixtureSchemaPath =
  (typeof WEBHOOK_FIXTURE_SCHEMA_PATHS)[keyof typeof WEBHOOK_FIXTURE_SCHEMA_PATHS];

/** Repo-root-relative JSON Schema paths for adapter fixtures (authoritative in runtime-manifest). */
export const ADAPTER_FIXTURE_SCHEMA_PATHS = {
  GITLAB_FETCH_CHANGES:
    'libs/runtime-manifest/schemas/adapter/gitlab.fetchChanges.v1.schema.json',
  PI_REVIEW: 'libs/runtime-manifest/schemas/adapter/pi.review.v1.schema.json',
} as const;

export type AdapterFixtureSchemaPath =
  (typeof ADAPTER_FIXTURE_SCHEMA_PATHS)[keyof typeof ADAPTER_FIXTURE_SCHEMA_PATHS];

const knownFixtureSchemaPaths = new Set<string>([
  ...Object.values(WEBHOOK_FIXTURE_SCHEMA_PATHS),
  ...Object.values(ADAPTER_FIXTURE_SCHEMA_PATHS),
]);

export function assertKnownFixtureSchemaPath(path: string): void {
  if (!knownFixtureSchemaPaths.has(path)) {
    throw new Error(
      `Unknown fixture schema path: ${path}. Known paths: ${[...knownFixtureSchemaPaths].sort().join(', ')}`,
    );
  }
  if (!path.startsWith('libs/runtime-manifest/schemas/')) {
    throw new Error(
      `Fixture schema path must be under libs/runtime-manifest/schemas/: ${path}`,
    );
  }
  if (!path.endsWith('.schema.json')) {
    throw new Error(`Fixture schema path must end with .schema.json: ${path}`);
  }
}
