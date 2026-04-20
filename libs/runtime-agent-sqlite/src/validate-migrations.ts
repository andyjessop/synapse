import type { AgentSqliteDefinition, SqliteMigration } from 'runtime-agent';
import { z } from 'zod';
import { computeNormalizedMigrationSqlHash } from './bundle-hash';

const hashSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);

const migrationObjectSchema = z.object({
  id: z.string().min(1),
  hash: hashSchema,
  sql: z.string().min(1),
});

/**
 * Validates agent `sqlite.migrations` at registry construction: Zod shape,
 * unique ids, non-empty list, and each `hash` matches normalized SQL (section 5b).
 */
export function assertValidAgentSqliteDefinition(
  sqlite: AgentSqliteDefinition,
): void {
  const list = sqlite.migrations;
  if (list.length === 0) {
    throw new Error('agent sqlite: migrations must be non-empty');
  }
  const ids = new Set<string>();
  for (const m of list) {
    migrationObjectSchema.parse(m);
    if (ids.has(m.id)) {
      throw new Error(`agent sqlite: duplicate migration id: ${m.id}`);
    }
    ids.add(m.id);
    const expected = computeNormalizedMigrationSqlHash(m.sql);
    if (expected !== m.hash) {
      throw new Error(
        `agent sqlite: migration ${m.id} hash ${m.hash} does not match normalized SQL hash ${expected}`,
      );
    }
  }
}

export function assertValidSqliteMigrations(
  migrations: readonly SqliteMigration[],
): void {
  assertValidAgentSqliteDefinition({ migrations });
}
