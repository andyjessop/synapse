import type { AgentSqliteFailureKind, RunFailureDetail } from 'runtime-agent';
import { AgentSqliteRuntimeError } from './errors';
import { readSqliteErrorCode } from './sqlite-codes';

export type SqlitePhase = 'open' | 'migrate' | 'metadata' | 'handler_query';

function defaultKindForPhase(phase: SqlitePhase): AgentSqliteFailureKind {
  switch (phase) {
    case 'handler_query':
      return 'agent_sqlite_query_failed';
    case 'migrate':
      return 'agent_sqlite_migration_failed';
    case 'open':
    case 'metadata':
      return 'agent_sqlite_open_failed';
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

export function classifySqliteRuntimeError(
  error: unknown,
  phase: SqlitePhase,
  context?: {
    agentName?: string;
    reactorName?: string;
    migrationId?: string;
    bundleHash?: string;
  },
): RunFailureDetail {
  const base = {
    subsystem: 'agent_sqlite' as const,
    agentName: context?.agentName,
    reactorName: context?.reactorName,
    migrationId: context?.migrationId,
    bundleHash: context?.bundleHash,
  };

  if (error instanceof AgentSqliteRuntimeError) {
    return error.detail;
  }

  if (error instanceof Error) {
    const msg = error.message;
    const code = readSqliteErrorCode(error);

    if (code === 'SQLITE_CORRUPT' || code === 'SQLITE_NOTADB') {
      return {
        kind: 'agent_sqlite_open_failed',
        retryable: false,
        message: msg,
        ...base,
      };
    }
    if (code === 'SQLITE_BUSY') {
      return {
        kind: 'agent_sqlite_open_failed',
        retryable: true,
        message: msg,
        ...base,
      };
    }
    if (msg.includes('agent_sqlite_migration_drift')) {
      return {
        kind: 'agent_sqlite_migration_drift',
        retryable: false,
        message: msg,
        ...base,
      };
    }
    if (msg.includes('agent_sqlite_agent_mismatch')) {
      return {
        kind: 'agent_sqlite_agent_mismatch',
        retryable: false,
        message: msg,
        ...base,
      };
    }
    if (msg.includes('result_limit_exceeded')) {
      return {
        kind: 'agent_sqlite_result_limit_exceeded',
        retryable: false,
        message: msg,
        ...base,
      };
    }
  }

  const message =
    error instanceof Error ? error.message : String(error ?? 'unknown');

  const kind = defaultKindForPhase(phase);

  return {
    kind,
    retryable: kind === 'agent_sqlite_open_failed',
    message,
    ...base,
  };
}

/**
 * Converts any thrown value from open/migrate into `AgentSqliteRuntimeError`
 * with structured `failure_detail` when it is not already classified.
 */
export function rethrowAsClassifiedAgentSqliteError(
  error: unknown,
  phase: SqlitePhase,
  context?: {
    agentName?: string;
    reactorName?: string;
    migrationId?: string;
    bundleHash?: string;
  },
): never {
  if (error instanceof AgentSqliteRuntimeError) {
    throw error;
  }
  const detail = classifySqliteRuntimeError(error, phase, context);
  throw new AgentSqliteRuntimeError(detail, {
    cause: error instanceof Error ? error : undefined,
  });
}
