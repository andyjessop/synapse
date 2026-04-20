import { MANIFEST_SCHEMA_PATH } from '../../src/fixture-schemas/schema-paths.js';

/** Required `version` + `schema` for inline manifest objects in tests. */
export const manifestDocumentBase = {
  version: 1 as const,
  schema: MANIFEST_SCHEMA_PATH,
};
