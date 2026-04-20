import { describe, expect, it } from 'vitest';
import {
  __testingLedgerMigrations,
  __testingMigrationOrdering,
  assertKnownMigrationId,
  LAST_RUNTIME_STORE_MIGRATION_ID,
} from '../../src/migrations';

describe('runtime-store migrations ledger', () => {
  it('orders streams baseline migration', () => {
    expect(__testingMigrationOrdering()).toEqual([
      '001_streams_runtime',
      '003_agent_runs_failure_detail',
      '005_drop_obsolete_runtime_tables',
      '006_normalize_legacy_payload_pointers',
    ]);
    expect(LAST_RUNTIME_STORE_MIGRATION_ID).toBe(
      '006_normalize_legacy_payload_pointers',
    );
  });

  it('exposes packaged ledger migration bodies for tooling', () => {
    expect(__testingLedgerMigrations()).toHaveLength(4);
    expect(__testingLedgerMigrations()[0]!.id).toBe('001_streams_runtime');
    expect(__testingLedgerMigrations()[0]!.sql).toContain('events');
    expect(__testingLedgerMigrations()[0]!.sql).toContain('event_outbox');
    expect(__testingLedgerMigrations()[0]!.sql).toContain('agent_runs');
    expect(__testingLedgerMigrations()[1]!.id).toBe(
      '003_agent_runs_failure_detail',
    );
    expect(__testingLedgerMigrations()[1]!.sql).toContain('failure_detail');
    expect(__testingLedgerMigrations()[2]!.id).toBe(
      '005_drop_obsolete_runtime_tables',
    );
    expect(__testingLedgerMigrations()[2]!.sql).toContain('event_outbox');
    expect(__testingLedgerMigrations()[2]!.sql).toContain('traceparent');
    expect(__testingLedgerMigrations()[3]!.id).toBe(
      '006_normalize_legacy_payload_pointers',
    );
    expect(__testingLedgerMigrations()[3]!.sql).toContain(
      '__synapse_event_payload_file_v1',
    );
  });

  it('validates known migration ids', () => {
    expect(assertKnownMigrationId('001_streams_runtime')).toBe(
      '001_streams_runtime',
    );
    expect(assertKnownMigrationId('003_agent_runs_failure_detail')).toBe(
      '003_agent_runs_failure_detail',
    );
    expect(assertKnownMigrationId('005_drop_obsolete_runtime_tables')).toBe(
      '005_drop_obsolete_runtime_tables',
    );
    expect(
      assertKnownMigrationId('006_normalize_legacy_payload_pointers'),
    ).toBe('006_normalize_legacy_payload_pointers');
    expect(() => assertKnownMigrationId('001_runtime_store')).toThrow(
      /Unknown runtime-store migration id/,
    );
  });
});
