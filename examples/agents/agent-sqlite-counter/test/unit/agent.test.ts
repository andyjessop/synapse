import { computeNormalizedMigrationSqlHash } from 'runtime-agent-sqlite';
import { describe, expect, it } from 'vitest';

import {
  SQLITE_COUNTER_AGENT_NAME,
  sqliteCounterAgentDefinition,
} from '../../src/agent.js';
import { defaultPingTokenIfUnset } from '../../src/ingress.js';

describe('defaultPingTokenIfUnset', () => {
  it('returns explicit token', () => {
    expect(defaultPingTokenIfUnset('fixed')).toBe('fixed');
  });

  it('generates once- prefix when undefined', () => {
    expect(defaultPingTokenIfUnset(undefined)).toMatch(/^once-/);
  });
});

describe('sqliteCounterAgentDefinition', () => {
  it('uses a valid sqlite slug and migration hash matches SQL', () => {
    expect(SQLITE_COUNTER_AGENT_NAME).toMatch(/^[a-z][a-z0-9-]*$/);
    const m = sqliteCounterAgentDefinition.sqlite?.migrations[0];
    expect(m).toBeDefined();
    expect(m!.hash).toBe(computeNormalizedMigrationSqlHash(m!.sql));
  });
});
