import type { Readable } from 'node:stream';

export interface CheckpointTrace {
  requirementIds?: string[];
  acceptanceCriteria?: string[];
  notes?: string[];
}

export interface SessionCheckpoint {
  sequence: number;
  hash: string;
  ref: string;
  label: string;
  kind: 'base' | 'checkpoint' | 'semantic';
  createdAt: string;
  trace?: CheckpointTrace;
}

export interface SessionInfo {
  sessionId: string;
  internalSessionId: string;
  repoPath: string;
  shadowRootPath: string;
  worktreePath: string;
  manifestPath: string;
  containerId: string;
  branchName: string;
  branchRef: string;
  baseCommitHash: string;
  currentCheckpointHash: string;
  currentCheckpointRef: string;
  checkpointSequence: number;
  imageReference: string;
  imageDigest: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionManifest extends SessionInfo {
  status: 'ready' | 'running' | 'destroying' | 'destroyed' | 'error';
  checkpoints: SessionCheckpoint[];
}

export interface SyncRequest {
  label?: string;
  trace?: CheckpointTrace;
}

export interface SyncResult {
  hash: string;
  ref: string;
  sequence: number;
}

/** Options for {@link IShadowGitBridge.destroySession}. */
export interface DestroySessionOptions {
  /**
   * When `false`, the session branch (`deus-shadow/session/…`) is left for the host to merge.
   * Worktree and container are still removed. Default `true`.
   */
  deleteBranch?: boolean;
}

export interface PromoteCheckpointRequest {
  checkpoint?: string;
  label: string;
  trace?: CheckpointTrace;
}

export interface PromoteCheckpointResult {
  hash: string;
  ref: string;
}

export interface ShadowGitBridgeOptions {
  shadowRootName?: string;
  allowedImages?: Record<string, string>;
  maxBufferedOutputBytes?: number;
  defaultTimeoutMs?: number;
  /**
   * Keys permitted on `docker exec … -e KEY=value` when propagating env into the **container**
   * workload. This is **not** the env block passed to the Docker CLI process on the host; that
   * is built separately inside `ShadowGitBridge` (host daemon access: `DOCKER_*`, etc.).
   */
  allowedDockerExecEnvKeys?: string[];
  /**
   * @deprecated Use {@link allowedDockerExecEnvKeys}. The old name was easy to confuse with
   * host-side Docker client configuration.
   */
  allowedEnvKeys?: string[];
  maxChangedFiles?: number;
  maxChangedBytes?: number;
  containerMemoryBytes?: number;
  containerNanoCpus?: number;
  containerPidsLimit?: number;
  containerUser?: string;
  sensitivePathPatterns?: RegExp[];
  sensitiveContentPatterns?: RegExp[];
}

export interface ExecutionRequest {
  command: string[];
  env?: Record<string, string>;
  timeoutMs?: number;
  checkpointLabel?: string;
  trace?: CheckpointTrace;
  /**
   * When `true`, a successful command run is followed by {@link IShadowGitBridge.sync} (checkpoint).
   * When `false`, the command is treated as observation/verification only — no checkpoint is created.
   * Default should be explicit at call sites; if omitted, defaults to `false` (no checkpoint).
   */
  checkpointOnSuccess?: boolean;
}

export interface ExecutionSummary {
  exitCode: number;
  durationMs: number;
  preExecutionHash: string;
  commitHash: string;
  postExecutionHash: string;
  stdout?: string;
  stderr?: string;
  stdoutTruncated?: boolean;
  stderrTruncated?: boolean;
  timedOut?: boolean;
  killed?: boolean;
}

export interface ExecutionStream {
  stdout: Readable;
  stderr: Readable;
  result: Promise<ExecutionSummary>;
  kill: () => void;
}

export interface IShadowGitBridge {
  createSession(
    repoPath: string,
    sessionId: string,
    image: string,
  ): Promise<SessionInfo>;
  sync(session: SessionInfo, request?: SyncRequest): Promise<SyncResult>;
  execute(session: SessionInfo, request: ExecutionRequest): ExecutionStream;
  /**
   * Runs a command and buffers stdout/stderr (bounded) without requiring stream consumers.
   */
  executeAndWait(
    session: SessionInfo,
    request: ExecutionRequest,
  ): Promise<ExecutionSummary>;
  /** Resolves an approved image alias or allowlisted ref for Docker. */
  resolveApprovedImageRef(requestedImage: string): string;
  destroySession(
    repoPath: string,
    session: SessionInfo,
    options?: DestroySessionOptions,
  ): Promise<void>;
  isDirty(repoPath: string): Promise<boolean>;
  /** Full diff from session base commit to current worktree; does not checkpoint. */
  getDiff(repoPath: string, session: SessionInfo): Promise<string>;
  /** Diff from `checkpoint` to the current worktree (committed + uncommitted); does not checkpoint. */
  getDiffSinceCheckpoint(
    session: SessionInfo,
    checkpoint: string,
  ): Promise<string>;
  /** Changed file paths from `checkpoint` to `HEAD`; does not checkpoint. */
  getChangedFilesSinceCheckpoint(
    session: SessionInfo,
    checkpoint: string,
  ): Promise<string[]>;
  applyPatch(repoPath: string, patch: string): Promise<void>;
  listCheckpoints(session: SessionInfo): Promise<SessionCheckpoint[]>;
  /** Resets the worktree to the checkpoint (`git reset --hard`) and removes untracked files (`git clean -fd`). */
  rollbackToCheckpoint(
    session: SessionInfo,
    checkpoint: string,
  ): Promise<SyncResult>;
  forkSession(
    repoPath: string,
    session: SessionInfo,
    newSessionId: string,
    image?: string,
  ): Promise<SessionInfo>;
  promoteCheckpoint(
    session: SessionInfo,
    request: PromoteCheckpointRequest,
  ): Promise<PromoteCheckpointResult>;
}
