alter table events
  add column if not exists traceparent text,
  add column if not exists tracestate text;
