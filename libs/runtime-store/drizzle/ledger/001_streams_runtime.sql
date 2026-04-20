drop table if exists runtime_capture_records cascade;
drop table if exists runtime_capture_payloads cascade;
drop table if exists projection_agent_health cascade;
drop table if exists projection_subject_timeline cascade;
drop table if exists projection_recent_activity cascade;
drop table if exists ingress_cursors cascade;
drop table if exists outbox_attempts cascade;
drop table if exists agent_runs cascade;
drop table if exists event_outbox cascade;
drop table if exists events cascade;

create table if not exists events (
  id text primary key,
  type text not null,
  source text not null,
  external_id text not null,
  subject text,
  data jsonb not null,
  root_id text not null,
  parent_id text,
  created_at timestamptz not null default now(),

  unique (source, external_id)
);

create table if not exists event_outbox (
  id text primary key,
  event_id text not null references events(id),
  published_at timestamptz,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),

  unique (event_id)
);

create table if not exists agent_runs (
  id text primary key,
  input_event_id text not null references events(id),
  agent_name text not null,
  reactor_name text not null,
  status text not null,
  attempt_count integer not null default 0,
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (input_event_id, agent_name, reactor_name),
  constraint agent_runs_status_check
    check (status in ('pending', 'queued', 'running', 'succeeded', 'failed'))
);

create index if not exists events_created_at_idx
  on events (created_at);

create index if not exists events_type_created_at_idx
  on events (type, created_at);

create index if not exists event_outbox_pending_idx
  on event_outbox (next_attempt_at, created_at)
  where published_at is null;

create index if not exists agent_runs_status_created_at_idx
  on agent_runs (status, created_at);

create index if not exists agent_runs_input_event_id_idx
  on agent_runs (input_event_id);
