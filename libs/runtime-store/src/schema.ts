export const AGENT_RUN_STATUSES = [
  'pending',
  'queued',
  'running',
  'succeeded',
  'failed',
] as const;

/** All physical table names managed by this package (ledger table included). */
export const EXPECTED_RUNTIME_STORE_TABLES = [
  'runtime_store_migrations',
  'events',
  'agent_runs',
] as const;
