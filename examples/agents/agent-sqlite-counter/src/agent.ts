import { defineReactor, defineRegistryAgent } from 'runtime-agent';
import { computeNormalizedMigrationSqlHash } from 'runtime-agent-sqlite';
import { EXAMPLE_AGENT_SQLITE_COUNTER } from 'runtime-events';

export const SQLITE_COUNTER_AGENT_NAME = EXAMPLE_AGENT_SQLITE_COUNTER;

const VISITS_TABLE_SQL = `create table visits (
  ping_token text primary key,
  count integer not null default 0
);
`;

const visitsMigration = {
  id: '001-visits',
  hash: computeNormalizedMigrationSqlHash(VISITS_TABLE_SQL),
  sql: VISITS_TABLE_SQL,
} as const;

export const sqliteCounterAgentDefinition = defineRegistryAgent({
  name: SQLITE_COUNTER_AGENT_NAME,
  sqlite: {
    migrations: [visitsMigration],
  },
  reactors: [
    defineReactor({
      name: 'count-request',
      subscribesTo: ['example.sqlite.count.requested.v1'],
      handler: async (event, ctx) => {
        const data = event.data as { ping_token: string };
        const db = ctx.requireDb();
        await db.exec(
          'insert into visits (ping_token, count) values (?, 1) on conflict(ping_token) do update set count = count + 1',
          [data.ping_token],
        );
        const row = await db.one<{ count: number }>(
          'select count from visits where ping_token = ?',
          [data.ping_token],
        );
        const countAfter = row?.count ?? 1;
        await ctx.emit(
          'example.sqlite.count.updated.v1',
          {
            ping_token: data.ping_token,
            count_after: countAfter,
            input_event_id: event.id,
          },
          { externalId: `sqlite-count-updated:${event.id}` },
        );
      },
    }),
  ],
});
