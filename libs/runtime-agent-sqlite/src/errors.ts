import type { RunFailureDetail } from 'runtime-agent';

export class AgentSqliteRuntimeError extends Error {
  readonly detail: RunFailureDetail;

  constructor(detail: RunFailureDetail, options?: { cause?: unknown }) {
    super(detail.message, options);
    this.name = 'AgentSqliteRuntimeError';
    this.detail = detail;
  }
}
