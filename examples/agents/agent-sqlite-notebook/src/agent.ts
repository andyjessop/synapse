import { randomUUID } from 'node:crypto';

import { defineReactor, defineRegistryAgent } from 'runtime-agent';
import { computeNormalizedMigrationSqlHash } from 'runtime-agent-sqlite';
import { EXAMPLE_AGENT_SQLITE_NOTEBOOK } from 'runtime-events';

export const SQLITE_NOTEBOOK_AGENT_NAME = EXAMPLE_AGENT_SQLITE_NOTEBOOK;

const NOTES_TABLE_SQL = `create table notes (
  id text primary key,
  subject text not null,
  body text not null
);
`;

const notesMigration = {
  id: '001-notes',
  hash: computeNormalizedMigrationSqlHash(NOTES_TABLE_SQL),
  sql: NOTES_TABLE_SQL,
} as const;

export const sqliteNotebookAgentDefinition = defineRegistryAgent({
  name: SQLITE_NOTEBOOK_AGENT_NAME,
  sqlite: {
    migrations: [notesMigration],
  },
  reactors: [
    defineReactor({
      name: 'append-note',
      subscribesTo: ['example.sqlite.note.append.v1'],
      handler: async (event, ctx) => {
        const data = event.data as { subject: string; body: string };
        const id = randomUUID();
        const db = ctx.requireDb();
        await db.exec(
          'insert into notes (id, subject, body) values (?, ?, ?)',
          [id, data.subject, data.body],
        );
        await ctx.emit(
          'example.sqlite.note.stored.v1',
          {
            note_id: id,
            subject: data.subject,
            char_count: data.body.length,
            input_event_id: event.id,
          },
          { externalId: `sqlite-note-stored:${event.id}` },
        );
      },
    }),
  ],
});
