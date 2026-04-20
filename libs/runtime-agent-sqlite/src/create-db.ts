import type { Database as SqliteDatabase } from 'better-sqlite3';
import type { AgentSqliteDb, SqliteExecResult } from 'runtime-agent';
import { AgentSqliteRuntimeError } from './errors';
import {
  containsReservedAgentSqliteTable,
  firstTokenIsForbiddenConnectionKeyword,
  readFirstSqlIdentifier,
  stripLeadingForFirstToken,
} from './guards';
import { evictAgentSqliteHandle } from './handle-cache';
import { readSqliteErrorCode } from './sqlite-codes';

const ALL_MAX_DEFAULT = 1000;
const ALL_MAX_HARD = 50_000;

function throwHandlerDbError(
  e: unknown,
  meta: { agentName: string; reactorName: string },
): never {
  const code = readSqliteErrorCode(e);
  if (code === 'SQLITE_CORRUPT' || code === 'SQLITE_NOTADB') {
    evictAgentSqliteHandle(meta.agentName);
    throw new AgentSqliteRuntimeError(
      {
        kind: 'agent_sqlite_open_failed',
        retryable: false,
        subsystem: 'agent_sqlite',
        agentName: meta.agentName,
        reactorName: meta.reactorName,
        message: e instanceof Error ? e.message : String(e),
      },
      { cause: e instanceof Error ? e : undefined },
    );
  }
  if (code === 'SQLITE_BUSY') {
    throw new AgentSqliteRuntimeError(
      {
        kind: 'agent_sqlite_query_failed',
        retryable: true,
        subsystem: 'agent_sqlite',
        agentName: meta.agentName,
        reactorName: meta.reactorName,
        message: e instanceof Error ? e.message : String(e),
      },
      { cause: e instanceof Error ? e : undefined },
    );
  }
  throw new AgentSqliteRuntimeError(
    {
      kind: 'agent_sqlite_query_failed',
      retryable: false,
      subsystem: 'agent_sqlite',
      agentName: meta.agentName,
      reactorName: meta.reactorName,
      message: e instanceof Error ? e.message : String(e),
    },
    { cause: e instanceof Error ? e : undefined },
  );
}

function assertReadSql(
  sql: string,
  meta: {
    agentName: string;
    reactorName: string;
  },
): void {
  const stripped = stripLeadingForFirstToken(sql);
  if (stripped.error === 'unterminated_block_comment') {
    throw new AgentSqliteRuntimeError({
      kind: 'agent_sqlite_query_failed',
      retryable: false,
      subsystem: 'agent_sqlite',
      agentName: meta.agentName,
      reactorName: meta.reactorName,
      message: 'unterminated block comment in SQL',
    });
  }
  const id = readFirstSqlIdentifier(stripped.rest);
  if (id === undefined) {
    throw new AgentSqliteRuntimeError({
      kind: 'agent_sqlite_query_failed',
      retryable: false,
      subsystem: 'agent_sqlite',
      agentName: meta.agentName,
      reactorName: meta.reactorName,
      message: 'expected SELECT or WITH for read query',
    });
  }
  const lower = id.toLowerCase();
  if (lower !== 'select' && lower !== 'with') {
    throw new AgentSqliteRuntimeError({
      kind: 'agent_sqlite_query_failed',
      retryable: false,
      subsystem: 'agent_sqlite',
      agentName: meta.agentName,
      reactorName: meta.reactorName,
      message: `read path must start with SELECT or WITH, got ${id}`,
    });
  }
}

function assertStatementReader(
  stmt: {
    readonly?: boolean;
    reader?: boolean;
  },
  meta: { agentName: string; reactorName: string },
): void {
  if (stmt.reader === true) {
    return;
  }
  if (stmt.readonly === true) {
    return;
  }
  throw new AgentSqliteRuntimeError({
    kind: 'agent_sqlite_query_failed',
    retryable: false,
    subsystem: 'agent_sqlite',
    agentName: meta.agentName,
    reactorName: meta.reactorName,
    message: 'statement is not read-only (reader/readonly check failed)',
  });
}

function resolvedMaxRows(
  options: { maxRows?: number } | undefined,
  meta: { agentName: string; reactorName: string },
): number {
  if (options?.maxRows === undefined) {
    return ALL_MAX_DEFAULT;
  }
  const n = options.maxRows;
  if (!Number.isInteger(n) || n < 1) {
    throw new AgentSqliteRuntimeError({
      kind: 'agent_sqlite_query_failed',
      retryable: false,
      subsystem: 'agent_sqlite',
      agentName: meta.agentName,
      reactorName: meta.reactorName,
      message: 'all() maxRows must be a positive integer',
    });
  }
  return Math.min(n, ALL_MAX_HARD);
}

export function createAgentSqliteDb(
  db: SqliteDatabase,
  meta: { agentName: string; reactorName: string },
): AgentSqliteDb {
  const exec: AgentSqliteDb['exec'] = async (sql, params) => {
    if (containsReservedAgentSqliteTable(sql)) {
      throw new AgentSqliteRuntimeError({
        kind: 'agent_sqlite_query_failed',
        retryable: false,
        subsystem: 'agent_sqlite',
        agentName: meta.agentName,
        reactorName: meta.reactorName,
        message: '__agent_sqlite_* is reserved',
      });
    }
    const stripped = stripLeadingForFirstToken(sql);
    if (stripped.error === 'unterminated_block_comment') {
      throw new AgentSqliteRuntimeError({
        kind: 'agent_sqlite_query_failed',
        retryable: false,
        subsystem: 'agent_sqlite',
        agentName: meta.agentName,
        reactorName: meta.reactorName,
        message: 'unterminated block comment',
      });
    }
    if (firstTokenIsForbiddenConnectionKeyword(sql)) {
      throw new AgentSqliteRuntimeError({
        kind: 'agent_sqlite_query_failed',
        retryable: false,
        subsystem: 'agent_sqlite',
        agentName: meta.agentName,
        reactorName: meta.reactorName,
        message: 'pragma/attach/detach are not allowed on handler exec',
      });
    }
    try {
      const stmt = db.prepare(sql);
      const runParams = params ?? [];
      const info = stmt.run(...runParams);
      const out: SqliteExecResult = {
        rowsWritten: Number(info.changes),
        lastInsertRowid:
          info.lastInsertRowid === undefined ? undefined : info.lastInsertRowid,
      };
      return out;
    } catch (e) {
      throwHandlerDbError(e, meta);
    }
  };

  const all = async <T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
    options?: { maxRows?: number },
  ): Promise<T[]> => {
    if (containsReservedAgentSqliteTable(sql)) {
      throw new AgentSqliteRuntimeError({
        kind: 'agent_sqlite_query_failed',
        retryable: false,
        subsystem: 'agent_sqlite',
        agentName: meta.agentName,
        reactorName: meta.reactorName,
        message: '__agent_sqlite_* is reserved',
      });
    }
    assertReadSql(sql, meta);
    const maxRows = resolvedMaxRows(options, meta);
    try {
      const stmt = db.prepare(sql);
      assertStatementReader(
        stmt as { readonly?: boolean; reader?: boolean },
        meta,
      );
      const iterParams = params ?? [];
      const rows: Record<string, unknown>[] = [];
      let count = 0;
      for (const row of stmt.iterate(...iterParams) as IterableIterator<
        Record<string, unknown>
      >) {
        count += 1;
        if (count > maxRows) {
          throw new AgentSqliteRuntimeError({
            kind: 'agent_sqlite_result_limit_exceeded',
            retryable: false,
            subsystem: 'agent_sqlite',
            agentName: meta.agentName,
            reactorName: meta.reactorName,
            message: `all() exceeded maxRows=${maxRows}`,
          });
        }
        rows.push(row);
      }
      return rows as T[];
    } catch (e) {
      if (e instanceof AgentSqliteRuntimeError) {
        throw e;
      }
      throwHandlerDbError(e, meta);
    }
  };

  const one = async <T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<T | undefined> => {
    if (containsReservedAgentSqliteTable(sql)) {
      throw new AgentSqliteRuntimeError({
        kind: 'agent_sqlite_query_failed',
        retryable: false,
        subsystem: 'agent_sqlite',
        agentName: meta.agentName,
        reactorName: meta.reactorName,
        message: '__agent_sqlite_* is reserved',
      });
    }
    assertReadSql(sql, meta);
    try {
      const stmt = db.prepare(sql);
      assertStatementReader(
        stmt as { readonly?: boolean; reader?: boolean },
        meta,
      );
      const iterParams = params ?? [];
      const row = stmt.get(...iterParams) as
        | Record<string, unknown>
        | undefined;
      return row as T | undefined;
    } catch (e) {
      if (e instanceof AgentSqliteRuntimeError) {
        throw e;
      }
      throwHandlerDbError(e, meta);
    }
  };

  return { exec, all, one } satisfies AgentSqliteDb;
}
