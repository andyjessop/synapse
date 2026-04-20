/**
 * Max durable events loaded per root for dev CLI graph views (live observer,
 * {@link gatherDevOnceRunRecord}, final Flow). Graphs with more events require
 * `tmp/dev/runs/*.json` artifacts or direct Postgres inspection.
 */
export const DEV_RUN_GRAPH_EVENT_LIMIT = 500;
