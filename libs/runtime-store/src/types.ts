import type { RunFailureDetail, SynapseEvent } from 'runtime-agent';

export type { RunFailureDetail, SynapseEvent } from 'runtime-agent';

export type AppendEventInput = {
  type: string;
  source: string;
  externalId: string;
  subject?: string;
  data: unknown;
  rootId?: string;
  parentId?: string;
};

export type EnsureAgentRunInput = {
  inputEventId: string;
  agentName: string;
  reactorName: string;
};

export type AgentRunStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed';

export type AgentRun = {
  id: string;
  inputEventId: string;
  agentName: string;
  reactorName: string;
  agent?: string;
  reactor?: string;
  status: AgentRunStatus;
  attemptCount: number;
  traceId?: string;
  lockedUntil?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export type ClaimedRun = AgentRun;

export type RuntimeStore = {
  appendEvent(input: AppendEventInput): Promise<SynapseEvent>;
  loadEventsForPlanning(limit: number): Promise<SynapseEvent[]>;
  ensureAgentRun(input: EnsureAgentRunInput): Promise<void>;
  loadPendingRuns(limit: number): Promise<AgentRun[]>;
  markRunQueued(runId: string): Promise<void>;
  claimRun(runId: string, lockMs: number): Promise<ClaimedRun | null>;
  renewRunLock(runId: string, lockMs: number): Promise<boolean>;
  markRunSucceeded(runId: string): Promise<void>;
  markRunFailed(
    runId: string,
    error: unknown,
    failureDetail?: RunFailureDetail,
  ): Promise<void>;
  repairStaleRuns(): Promise<void>;
  loadEvent(eventId: string): Promise<SynapseEvent>;
};

export type EventRecord = SynapseEvent;
export type AgentRunRecord = AgentRun;
