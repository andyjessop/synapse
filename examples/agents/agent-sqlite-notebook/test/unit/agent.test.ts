import { computeNormalizedMigrationSqlHash } from 'runtime-agent-sqlite';
import { describe, expect, it } from 'vitest';

import {
  SQLITE_NOTEBOOK_AGENT_NAME,
  sqliteNotebookAgentDefinition,
} from '../../src/agent.js';

describe('sqliteNotebookAgentDefinition', () => {
  it('uses a valid sqlite slug and migration hash matches SQL', () => {
    expect(SQLITE_NOTEBOOK_AGENT_NAME).toMatch(/^[a-z][a-z0-9-]*$/);
    const m = sqliteNotebookAgentDefinition.sqlite?.migrations[0];
    expect(m).toBeDefined();
    expect(m!.hash).toBe(computeNormalizedMigrationSqlHash(m!.sql));
  });
});
