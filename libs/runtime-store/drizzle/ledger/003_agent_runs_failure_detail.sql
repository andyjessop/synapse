alter table agent_runs
  add column if not exists failure_detail jsonb;
