import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import type { ImageInfo } from 'dockerode';
import Docker from 'dockerode';
import { resolveShadowNodeRunnerImageRef } from './default-node-runner-image';
import { createInternalSessionId, validateSessionId } from './sessionId';
import {
  createBaseCheckpoint,
  ensureShadowRootLayout,
  findManifestBySessionId,
  listSessionManifestPaths,
  manifestPathForSession,
  nextCheckpointRef,
  nextSemanticRef,
  readSessionManifest,
  removeSessionManifest,
  sessionFromManifest,
  worktreesDir,
  writeSessionManifest,
} from './sessionManifest';
import { getShadowRootPath, isShadowPath } from './shadowPaths';
import type {
  DestroySessionOptions,
  ExecutionRequest,
  ExecutionStream,
  ExecutionSummary,
  IShadowGitBridge,
  PromoteCheckpointRequest,
  PromoteCheckpointResult,
  SessionInfo,
  SessionManifest,
  ShadowGitBridgeOptions,
  SyncRequest,
  SyncResult,
} from './types';

/** Pinned tag (not `:latest`) for the optional `git-runner` alias. */
const DEFAULT_GIT_RUNNER_IMAGE =
  process.env.SHADOW_GIT_BRIDGE_GIT_IMAGE ??
  process.env.LABORATORY_DOCKER_IMAGE ??
  'alpine/git:v2.49.1';

const DEFAULT_ALLOWED_IMAGES = {
  'git-runner': DEFAULT_GIT_RUNNER_IMAGE,
  'node-runner': resolveShadowNodeRunnerImageRef(),
} as const;

const DEFAULT_SENSITIVE_PATH_PATTERNS = [
  /(^|\/)\.env(\..*)?$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.pypirc$/i,
  /(^|\/)credentials.*\.json$/i,
  /(^|\/).*\.pem$/i,
  /(^|\/).*\.key$/i,
  /(^|\/).*\.p12$/i,
  /(^|\/).*\.pfx$/i,
  /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/i,
] as const;

const DEFAULT_SENSITIVE_CONTENT_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bghp_[A-Za-z0-9]{36,}\b/,
  /\b(?:password|secret|token|api[_-]?key)\b\s*[:=]\s*["']?[^\s"']+/i,
] as const;

const DEFAULT_ALLOWED_ENV_KEYS = [
  'CI',
  'FORCE_COLOR',
  'TERM',
  'COLORTERM',
  'NO_COLOR',
] as const;

const DEFAULT_MAX_BUFFERED_OUTPUT_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_MAX_CHANGED_FILES = 512;
const DEFAULT_MAX_CHANGED_BYTES = 10 * 1024 * 1024;
const DEFAULT_CONTAINER_MEMORY_BYTES = 512 * 1024 * 1024;
const DEFAULT_CONTAINER_NANO_CPUS = 1_000_000_000;
const DEFAULT_CONTAINER_PIDS_LIMIT = 256;

/**
 * Session containers run as the host UID ({@link ShadowGitBridge.defaultContainerUser}) so that
 * bind-mounted files have sensible ownership. That user often has no `/etc/passwd` entry inside
 * the image, and `docker exec` can inherit an empty or minimal `PATH`, so `bun` in
 * `/usr/local/bin` is not found (exit 127). Pin `PATH` and a writable `HOME`.
 */
const DEFAULT_CONTAINER_SESSION_ENV = [
  'PATH=/usr/local/bin:/usr/bin:/bin:/sbin:/usr/sbin',
  'HOME=/tmp',
] as const;

/** Bind mount target and process cwd for shadow sessions (must match {@link createSession} `WorkingDir`). */
const SESSION_CONTAINER_WORKDIR = '/repo';

/** Ensures every `docker exec` sets PATH/HOME — nested tools (e.g. `Bun.spawn(["bun", …])` in repo scripts) need this even when container `Config.Env` exists. */
function dockerExecSessionEnvFlags(): string[] {
  return DEFAULT_CONTAINER_SESSION_ENV.flatMap((line) => ['-e', line]);
}

type RepoIdentity = {
  canonicalRepoPath: string;
  baseCommitHash: string;
};

type ResolvedImage = {
  imageReference: string;
  imageDigest: string;
};

type StatusEntry = {
  code: string;
  path: string;
};

export class ShadowGitBridge implements IShadowGitBridge {
  private readonly docker: Docker;
  private readonly operationLocks = new Map<string, Promise<unknown>>();
  private readonly options: Required<
    Pick<
      ShadowGitBridgeOptions,
      | 'allowedImages'
      | 'maxBufferedOutputBytes'
      | 'defaultTimeoutMs'
      | 'allowedDockerExecEnvKeys'
      | 'maxChangedFiles'
      | 'maxChangedBytes'
      | 'containerMemoryBytes'
      | 'containerNanoCpus'
      | 'containerPidsLimit'
      | 'containerUser'
      | 'sensitivePathPatterns'
      | 'sensitiveContentPatterns'
    >
  > &
    Pick<ShadowGitBridgeOptions, 'shadowRootName'>;

  constructor(options: ShadowGitBridgeOptions = {}) {
    this.docker = new Docker();
    this.options = {
      shadowRootName: options.shadowRootName,
      allowedImages: options.allowedImages ?? { ...DEFAULT_ALLOWED_IMAGES },
      maxBufferedOutputBytes:
        options.maxBufferedOutputBytes ?? DEFAULT_MAX_BUFFERED_OUTPUT_BYTES,
      defaultTimeoutMs: options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
      allowedDockerExecEnvKeys: options.allowedDockerExecEnvKeys ??
        options.allowedEnvKeys ?? [...DEFAULT_ALLOWED_ENV_KEYS],
      maxChangedFiles: options.maxChangedFiles ?? DEFAULT_MAX_CHANGED_FILES,
      maxChangedBytes: options.maxChangedBytes ?? DEFAULT_MAX_CHANGED_BYTES,
      containerMemoryBytes:
        options.containerMemoryBytes ?? DEFAULT_CONTAINER_MEMORY_BYTES,
      containerNanoCpus:
        options.containerNanoCpus ?? DEFAULT_CONTAINER_NANO_CPUS,
      containerPidsLimit:
        options.containerPidsLimit ?? DEFAULT_CONTAINER_PIDS_LIMIT,
      containerUser: options.containerUser ?? this.defaultContainerUser(),
      sensitivePathPatterns: options.sensitivePathPatterns ?? [
        ...DEFAULT_SENSITIVE_PATH_PATTERNS,
      ],
      sensitiveContentPatterns: options.sensitiveContentPatterns ?? [
        ...DEFAULT_SENSITIVE_CONTENT_PATTERNS,
      ],
    };
  }

  async createSession(
    repoPath: string,
    sessionId: string,
    image: string,
  ): Promise<SessionInfo> {
    const safeSessionId = validateSessionId(sessionId);
    const repoIdentity = await this.validateRepo(repoPath);
    const shadowRootPath = getShadowRootPath(
      repoIdentity.canonicalRepoPath,
      this.options,
    );
    return this.withLock(
      this.logicalSessionLockKey(repoIdentity.canonicalRepoPath, safeSessionId),
      async () => {
        await ensureShadowRootLayout(shadowRootPath);
        await this.recoverOrphans(
          repoIdentity.canonicalRepoPath,
          shadowRootPath,
        );

        const existing = await findManifestBySessionId(
          shadowRootPath,
          safeSessionId,
        );
        if (existing) {
          await this.destroyManifestArtifacts(
            repoIdentity.canonicalRepoPath,
            existing,
            true,
            { deleteBranch: true },
          );
        }

        return this.createSessionFromBase({
          repoIdentity,
          sessionId: safeSessionId,
          image,
          baseCommitHash: repoIdentity.baseCommitHash,
        });
      },
    );
  }

  execute(session: SessionInfo, request: ExecutionRequest): ExecutionStream {
    const startTime = Date.now();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    let child: ReturnType<typeof spawn> | null = null;
    let killReason: 'manual' | 'timeout' | null = null;
    let requestTermination: ((reason: 'manual' | 'timeout') => void) | null =
      null;

    const result = this.withLock(this.sessionLockKey(session), async () => {
      const manifest = await this.loadSessionManifest(session);
      const preExecutionHash = manifest.currentCheckpointHash;
      await this.ensureContainerRunning(manifest.containerId);

      let stdoutBuffer = '';
      let stderrBuffer = '';
      let stdoutTruncated = false;
      let stderrTruncated = false;
      const timeoutMs = request.timeoutMs ?? this.options.defaultTimeoutMs;
      const dockerArgs = [
        'exec',
        '-i',
        '-w',
        SESSION_CONTAINER_WORKDIR,
        ...dockerExecSessionEnvFlags(),
        ...this.buildDockerExecEnvArgs(request.env),
        manifest.containerId,
        ...request.command,
      ];

      return new Promise<ExecutionSummary>((resolve, reject) => {
        let settled = false;
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        let forcedTerminationHandle: ReturnType<typeof setTimeout> | undefined;

        const settle = async (
          type: 'resolve' | 'reject',
          payload: ExecutionSummary | Error,
        ) => {
          if (settled) {
            return;
          }
          settled = true;
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
          if (forcedTerminationHandle) {
            clearTimeout(forcedTerminationHandle);
          }
          stdout.end();
          stderr.end();
          if (type === 'resolve') {
            resolve(payload as ExecutionSummary);
            return;
          }
          reject(payload);
        };

        const finalizeExecution = async (exitCode: number) => {
          try {
            const effectiveExit = killReason == null ? exitCode : 130;
            const shouldCheckpoint =
              request.checkpointOnSuccess === true &&
              killReason == null &&
              effectiveExit === 0;
            if (shouldCheckpoint) {
              const postExecution = await this.syncSession(manifest, {
                label:
                  request.checkpointLabel ??
                  `exec:${request.command[0] ?? 'command'}`,
                trace: request.trace,
              });
              await settle('resolve', {
                exitCode: effectiveExit,
                durationMs: Date.now() - startTime,
                preExecutionHash,
                commitHash: postExecution.hash,
                postExecutionHash: postExecution.hash,
                stdout: stdoutBuffer,
                stderr: stderrBuffer,
                stdoutTruncated,
                stderrTruncated,
                timedOut: killReason === 'timeout',
                killed: killReason === 'manual',
              });
              return;
            }
            await settle('resolve', {
              exitCode: effectiveExit,
              durationMs: Date.now() - startTime,
              preExecutionHash,
              commitHash: preExecutionHash,
              postExecutionHash: preExecutionHash,
              stdout: stdoutBuffer,
              stderr: stderrBuffer,
              stdoutTruncated,
              stderrTruncated,
              timedOut: killReason === 'timeout',
              killed: killReason === 'manual',
            });
          } catch (error) {
            await settle(
              'reject',
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        };

        requestTermination = (reason: 'manual' | 'timeout') => {
          if (killReason != null) {
            return;
          }
          killReason = reason;
          child?.kill('SIGTERM');
          forcedTerminationHandle = setTimeout(() => {
            void finalizeExecution(130);
          }, 250);
        };

        try {
          child = spawn('docker', dockerArgs, {
            env: this.buildDockerClientEnv(),
            shell: false,
          });
        } catch (error) {
          void settle(
            'reject',
            error instanceof Error ? error : new Error(String(error)),
          );
          return;
        }

        child.stdout?.pipe(stdout);
        child.stderr?.pipe(stderr);

        child.stdout?.on('data', (chunk) => {
          const next = appendBoundedOutput(
            stdoutBuffer,
            chunk.toString(),
            this.options.maxBufferedOutputBytes,
          );
          stdoutBuffer = next.value;
          stdoutTruncated = stdoutTruncated || next.truncated;
        });

        child.stderr?.on('data', (chunk) => {
          const next = appendBoundedOutput(
            stderrBuffer,
            chunk.toString(),
            this.options.maxBufferedOutputBytes,
          );
          stderrBuffer = next.value;
          stderrTruncated = stderrTruncated || next.truncated;
        });

        child.on('error', (error) => {
          void settle(
            'reject',
            error instanceof Error ? error : new Error(String(error)),
          );
        });

        child.on('close', async (code) => {
          await finalizeExecution(killReason == null ? (code ?? 0) : 130);
        });

        timeoutHandle = setTimeout(() => {
          requestTermination?.('timeout');
        }, timeoutMs);
      });
    });

    return {
      stdout,
      stderr,
      result,
      kill: () => {
        requestTermination?.('manual');
      },
    };
  }

  async executeAndWait(
    session: SessionInfo,
    request: ExecutionRequest,
  ): Promise<ExecutionSummary> {
    const stream = this.execute(session, request);
    stream.stdout.resume();
    stream.stderr.resume();
    return stream.result;
  }

  /**
   * Resolves an approved image alias (e.g. `node-runner`) or an allowlisted full ref to the ref used with Docker.
   */
  resolveApprovedImageRef(requestedImage: string): string {
    return this.resolveApprovedImage(requestedImage);
  }

  async isDirty(repoPath: string): Promise<boolean> {
    try {
      const { canonicalRepoPath } = await this.validateRepo(repoPath);
      const { stdout } = await this.execCommand(
        'git',
        ['status', '--porcelain'],
        { cwd: canonicalRepoPath },
      );
      return stdout.trim().length > 0;
    } catch (_err) {
      return true;
    }
  }

  async getDiff(repoPath: string, session: SessionInfo): Promise<string> {
    await this.validateRepo(repoPath);
    return this.withLock(this.sessionLockKey(session), async () => {
      const manifest = await this.loadSessionManifest(session);
      const { stdout: diff } = await this.execCommand(
        'git',
        ['diff', manifest.baseCommitHash],
        { cwd: manifest.worktreePath },
      );
      return diff;
    });
  }

  async getDiffSinceCheckpoint(
    session: SessionInfo,
    checkpoint: string,
  ): Promise<string> {
    return this.withLock(this.sessionLockKey(session), async () => {
      const manifest = await this.loadSessionManifest(session);
      /** One-arg `git diff <commit>` includes uncommitted work vs that commit (required when mutating commands do not checkpoint). */
      const { stdout: diff } = await this.execCommand(
        'git',
        ['diff', checkpoint],
        { cwd: manifest.worktreePath },
      );
      return diff;
    });
  }

  async getChangedFilesSinceCheckpoint(
    session: SessionInfo,
    checkpoint: string,
  ): Promise<string[]> {
    return this.withLock(this.sessionLockKey(session), async () => {
      const manifest = await this.loadSessionManifest(session);
      const { stdout: names } = await this.execCommand(
        'git',
        ['diff', '--name-only', checkpoint],
        { cwd: manifest.worktreePath },
      );
      return names
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    });
  }

  async applyPatch(repoPath: string, patch: string): Promise<void> {
    if (!patch.trim()) {
      return;
    }

    const { canonicalRepoPath } = await this.validateRepo(repoPath);
    const patchDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'deus-shadow-patch-'),
    );
    const patchPath = path.join(patchDirectory, `${crypto.randomUUID()}.patch`);
    try {
      await fs.writeFile(patchPath, patch, 'utf8');
      await this.execCommand('git', ['apply', patchPath], {
        cwd: canonicalRepoPath,
      });
    } finally {
      await fs
        .rm(patchDirectory, { recursive: true, force: true })
        .catch(() => {});
    }
  }

  async destroySession(
    repoPath: string,
    session: SessionInfo,
    options?: DestroySessionOptions,
  ): Promise<void> {
    const deleteBranch = options?.deleteBranch !== false;
    const { canonicalRepoPath } = await this.validateRepo(repoPath);
    await this.withLock(this.sessionLockKey(session), async () => {
      const manifest = await this.loadSessionManifest(session).catch(
        () => session as SessionManifest,
      );
      await this.destroyManifestArtifacts(canonicalRepoPath, manifest, true, {
        deleteBranch,
      });
    });
  }

  async listCheckpoints(session: SessionInfo) {
    const manifest = await this.loadSessionManifest(session);
    return [...manifest.checkpoints];
  }

  async rollbackToCheckpoint(
    session: SessionInfo,
    checkpoint: string,
  ): Promise<SyncResult> {
    return this.withLock(this.sessionLockKey(session), async () => {
      const manifest = await this.loadSessionManifest(session);
      const target = manifest.checkpoints.find(
        (entry) =>
          entry.hash === checkpoint ||
          entry.ref === checkpoint ||
          String(entry.sequence) === checkpoint,
      );
      if (!target) {
        throw new Error(
          `Unknown checkpoint "${checkpoint}" for session ${session.sessionId}`,
        );
      }
      await this.execCommand('git', ['reset', '--hard', target.hash], {
        cwd: manifest.worktreePath,
      });
      await this.execCommand('git', ['clean', '-fd'], {
        cwd: manifest.worktreePath,
      });
      const updated: SessionManifest = {
        ...manifest,
        currentCheckpointHash: target.hash,
        currentCheckpointRef: target.ref,
        updatedAt: new Date().toISOString(),
      };
      await writeSessionManifest(manifest.manifestPath, updated);
      return {
        hash: target.hash,
        ref: target.ref,
        sequence: target.sequence,
      };
    });
  }

  async forkSession(
    repoPath: string,
    session: SessionInfo,
    newSessionId: string,
    image = session.imageReference,
  ): Promise<SessionInfo> {
    const { canonicalRepoPath } = await this.validateRepo(repoPath);
    const source = await this.loadSessionManifest(session);
    return this.withLock(
      this.logicalSessionLockKey(
        canonicalRepoPath,
        validateSessionId(newSessionId),
      ),
      () =>
        this.createSessionFromBase({
          repoIdentity: {
            canonicalRepoPath,
            baseCommitHash: source.currentCheckpointHash,
          },
          sessionId: validateSessionId(newSessionId),
          image,
          baseCommitHash: source.currentCheckpointHash,
        }),
    );
  }

  async promoteCheckpoint(
    session: SessionInfo,
    request: PromoteCheckpointRequest,
  ): Promise<PromoteCheckpointResult> {
    return this.withLock(this.sessionLockKey(session), async () => {
      const manifest = await this.loadSessionManifest(session);
      const target =
        request.checkpoint == null
          ? manifest.checkpoints.at(-1)
          : manifest.checkpoints.find(
              (entry) =>
                entry.hash === request.checkpoint ||
                entry.ref === request.checkpoint ||
                String(entry.sequence) === request.checkpoint,
            );
      if (!target) {
        throw new Error(
          `Unknown checkpoint "${request.checkpoint}" for session ${session.sessionId}`,
        );
      }

      const semanticRef = nextSemanticRef(manifest, request.label);
      await this.execCommand('git', ['update-ref', semanticRef, target.hash], {
        cwd: manifest.worktreePath,
      });
      const updated: SessionManifest = {
        ...manifest,
        checkpoints: [
          ...manifest.checkpoints,
          {
            sequence: manifest.checkpointSequence,
            hash: target.hash,
            ref: semanticRef,
            label: request.label,
            kind: 'semantic',
            createdAt: new Date().toISOString(),
            trace: request.trace,
          },
        ],
        updatedAt: new Date().toISOString(),
      };
      await writeSessionManifest(manifest.manifestPath, updated);
      return { hash: target.hash, ref: semanticRef };
    });
  }

  private async createSessionFromBase(args: {
    repoIdentity: RepoIdentity;
    sessionId: string;
    image: string;
    baseCommitHash: string;
  }): Promise<SessionInfo> {
    const { repoIdentity, sessionId, image, baseCommitHash } = args;
    const shadowRootPath = getShadowRootPath(
      repoIdentity.canonicalRepoPath,
      this.options,
    );
    await ensureShadowRootLayout(shadowRootPath);
    const internalSessionId = createInternalSessionId();
    const branchName = `deus-shadow/session/${internalSessionId}`;
    await this.execCommand(
      'git',
      ['check-ref-format', '--branch', branchName],
      { cwd: repoIdentity.canonicalRepoPath },
    );

    const worktreePath = path.resolve(
      worktreesDir(shadowRootPath),
      internalSessionId,
    );
    this.assertWithinShadowRoot(shadowRootPath, worktreePath);
    const manifestPath = manifestPathForSession(
      shadowRootPath,
      internalSessionId,
    );
    const branchRef = `refs/heads/${branchName}`;
    const currentCheckpointRef = nextCheckpointRef(
      {
        sessionId,
        internalSessionId,
        repoPath: repoIdentity.canonicalRepoPath,
        shadowRootPath,
        worktreePath,
        manifestPath,
        containerId: '',
        branchName,
        branchRef,
        baseCommitHash,
        currentCheckpointHash: baseCommitHash,
        currentCheckpointRef: '',
        checkpointSequence: 0,
        imageReference: image,
        imageDigest: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      0,
    );
    const resolvedImage = await this.resolveImage(image);

    let manifest: SessionManifest | null = null;
    try {
      await fs.rm(worktreePath, { recursive: true, force: true });
      await this.execCommand(
        'git',
        ['worktree', 'add', '-f', '--detach', worktreePath, baseCommitHash],
        { cwd: repoIdentity.canonicalRepoPath },
      );
      await this.execCommand('git', ['checkout', '-B', branchName], {
        cwd: worktreePath,
      });
      await this.execCommand(
        'git',
        ['update-ref', currentCheckpointRef, baseCommitHash],
        { cwd: worktreePath },
      );

      const container = await this.docker.createContainer({
        Image: resolvedImage.imageDigest,
        Cmd: ['tail', '-f', '/dev/null'],
        Entrypoint: [],
        Env: [...DEFAULT_CONTAINER_SESSION_ENV],
        WorkingDir: SESSION_CONTAINER_WORKDIR,
        User: this.options.containerUser,
        HostConfig: {
          Binds: [`${worktreePath}:${SESSION_CONTAINER_WORKDIR}:rw`],
          NetworkMode: 'none',
          ReadonlyRootfs: true,
          CapDrop: ['ALL'],
          SecurityOpt: ['no-new-privileges:true'],
          PidsLimit: this.options.containerPidsLimit,
          Memory: this.options.containerMemoryBytes,
          NanoCpus: this.options.containerNanoCpus,
          AutoRemove: false,
          Tmpfs: {
            '/tmp': 'rw,noexec,nosuid,size=64m',
          },
        },
      });
      await container.start();

      const createdAt = new Date().toISOString();
      manifest = {
        sessionId,
        internalSessionId,
        repoPath: repoIdentity.canonicalRepoPath,
        shadowRootPath,
        worktreePath,
        manifestPath,
        containerId: container.id,
        branchName,
        branchRef,
        baseCommitHash,
        currentCheckpointHash: baseCommitHash,
        currentCheckpointRef,
        checkpointSequence: 0,
        imageReference: resolvedImage.imageReference,
        imageDigest: resolvedImage.imageDigest,
        createdAt,
        updatedAt: createdAt,
        status: 'ready',
        checkpoints: [],
      };
      manifest.checkpoints = [
        createBaseCheckpoint(sessionFromManifest(manifest)),
      ];
      await writeSessionManifest(manifestPath, manifest);
      return sessionFromManifest(manifest);
    } catch (error) {
      if (manifest) {
        await removeSessionManifest(manifestPath).catch(() => {});
      }
      await this.destroyManifestArtifacts(
        repoIdentity.canonicalRepoPath,
        {
          sessionId,
          internalSessionId,
          repoPath: repoIdentity.canonicalRepoPath,
          shadowRootPath,
          worktreePath,
          manifestPath,
          containerId: manifest?.containerId ?? '',
          branchName,
          branchRef,
          baseCommitHash,
          currentCheckpointHash: baseCommitHash,
          currentCheckpointRef,
          checkpointSequence: 0,
          imageReference: resolvedImage.imageReference,
          imageDigest: resolvedImage.imageDigest,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'error',
          checkpoints: [],
        },
        true,
        { deleteBranch: true },
      ).catch(() => {});
      throw new Error(
        `Failed to initialize session ${sessionId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async syncSession(
    session: SessionInfo,
    request: SyncRequest = {},
  ): Promise<SyncResult> {
    const manifest = await this.loadSessionManifest(session);
    const statusEntries = await this.readStatusEntries(manifest.worktreePath);
    await this.enforceChangeBudget(manifest.worktreePath, statusEntries);

    await this.execCommand('git', ['add', '-u', '--', '.'], {
      cwd: manifest.worktreePath,
    });

    for (const entry of statusEntries.filter((item) => item.code === '??')) {
      if (this.isSensitivePath(entry.path)) {
        throw new Error(
          `Refusing to stage sensitive path "${entry.path}" in session ${manifest.sessionId}`,
        );
      }
      await this.execCommand('git', ['add', '--', entry.path], {
        cwd: manifest.worktreePath,
      });
    }

    const { stdout: stagedNames } = await this.execCommand(
      'git',
      ['diff', '--cached', '--name-only'],
      { cwd: manifest.worktreePath },
    );
    const stagedPaths = stagedNames
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    for (const stagedPath of stagedPaths) {
      if (this.isSensitivePath(stagedPath)) {
        throw new Error(
          `Refusing to checkpoint sensitive path "${stagedPath}" in session ${manifest.sessionId}`,
        );
      }
    }

    const { stdout: stagedDiff } = await this.execCommand(
      'git',
      ['diff', '--cached', '--no-ext-diff', '--binary', '--unified=0'],
      { cwd: manifest.worktreePath },
    );
    this.scanDiffForSecrets(stagedDiff);

    if (stagedPaths.length === 0) {
      return {
        hash: manifest.currentCheckpointHash,
        ref: manifest.currentCheckpointRef,
        sequence: manifest.checkpointSequence,
      };
    }

    const sequence = manifest.checkpointSequence + 1;
    const checkpointRef = nextCheckpointRef(manifest, sequence);
    const label = request.label?.trim() || `checkpoint-${sequence}`;
    await this.execCommand(
      'git',
      [
        'commit',
        '-m',
        `deus:shadow:checkpoint:${sequence}:${label}`,
        '--no-gpg-sign',
      ],
      { cwd: manifest.worktreePath },
    );
    const { stdout: hash } = await this.execCommand(
      'git',
      ['rev-parse', 'HEAD'],
      { cwd: manifest.worktreePath },
    );
    await this.execCommand('git', ['update-ref', checkpointRef, hash.trim()], {
      cwd: manifest.worktreePath,
    });

    const updated: SessionManifest = {
      ...manifest,
      currentCheckpointHash: hash.trim(),
      currentCheckpointRef: checkpointRef,
      checkpointSequence: sequence,
      updatedAt: new Date().toISOString(),
      checkpoints: [
        ...manifest.checkpoints,
        {
          sequence,
          hash: hash.trim(),
          ref: checkpointRef,
          label,
          kind: 'checkpoint',
          createdAt: new Date().toISOString(),
          trace: request.trace,
        },
      ],
    };
    await writeSessionManifest(manifest.manifestPath, updated);
    return {
      hash: updated.currentCheckpointHash,
      ref: updated.currentCheckpointRef,
      sequence: updated.checkpointSequence,
    };
  }

  async sync(session: SessionInfo, request?: SyncRequest): Promise<SyncResult> {
    return this.withLock(this.sessionLockKey(session), () =>
      this.syncSession(session, request),
    );
  }

  private async loadSessionManifest(
    session: SessionInfo,
  ): Promise<SessionManifest> {
    const manifest =
      (await readSessionManifest(session.manifestPath)) ??
      (await findManifestBySessionId(
        session.shadowRootPath,
        session.sessionId,
      ));
    if (!manifest) {
      throw new Error(`Missing session manifest for ${session.sessionId}`);
    }
    return manifest;
  }

  private async recoverOrphans(
    repoPath: string,
    shadowRootPath: string,
  ): Promise<void> {
    for (const manifestPath of await listSessionManifestPaths(shadowRootPath)) {
      const manifest = await readSessionManifest(manifestPath);
      if (!manifest) {
        await removeSessionManifest(manifestPath).catch(() => {});
        continue;
      }
      const worktreeExists = await pathExists(manifest.worktreePath);
      const containerExists = manifest.containerId
        ? await this.containerExists(manifest.containerId)
        : false;
      if (
        manifest.status === 'destroyed' ||
        !worktreeExists ||
        !containerExists
      ) {
        await this.destroyManifestArtifacts(repoPath, manifest, true, {
          deleteBranch: true,
        });
      }
    }
  }

  private async destroyManifestArtifacts(
    repoPath: string,
    manifest: SessionManifest,
    removeManifestFile: boolean,
    options: { deleteBranch: boolean } = { deleteBranch: true },
  ): Promise<void> {
    if (manifest.containerId) {
      await this.stopAndRemoveContainer(manifest.containerId).catch(() => {});
    }

    if (manifest.worktreePath) {
      await this.execCommand(
        'git',
        ['worktree', 'remove', '--force', manifest.worktreePath],
        { cwd: repoPath },
      ).catch(() => {});
      await fs
        .rm(manifest.worktreePath, {
          recursive: true,
          force: true,
        })
        .catch(() => {});
    }

    if (manifest.branchName && options.deleteBranch) {
      await this.execCommand('git', ['branch', '-D', manifest.branchName], {
        cwd: repoPath,
      }).catch(() => {});
    }

    await this.deleteRefsWithPrefix(
      repoPath,
      `refs/deus-shadow/checkpoints/${manifest.internalSessionId}/`,
    );
    await this.deleteRefsWithPrefix(
      repoPath,
      `refs/deus-shadow/semantic/${manifest.internalSessionId}/`,
    );

    if (removeManifestFile) {
      await removeSessionManifest(manifest.manifestPath).catch(() => {});
    } else {
      await writeSessionManifest(manifest.manifestPath, {
        ...manifest,
        status: 'destroyed',
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }

    await this.pruneEmptyShadowRoot(manifest.shadowRootPath);
  }

  private async deleteRefsWithPrefix(
    repoPath: string,
    prefix: string,
  ): Promise<void> {
    const { stdout } = await this.execCommand(
      'git',
      ['for-each-ref', '--format=%(refname)', prefix],
      { cwd: repoPath },
    ).catch(() => ({ stdout: '' }));
    for (const ref of stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)) {
      await this.execCommand('git', ['update-ref', '-d', ref], {
        cwd: repoPath,
      }).catch(() => {});
    }
  }

  private async stopAndRemoveContainer(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.stop().catch((error: unknown) => {
      if (!isIgnorableDockerError(error, [404, 304])) {
        throw error;
      }
    });
    await container.remove().catch((error: unknown) => {
      if (!isIgnorableDockerError(error, [404])) {
        throw error;
      }
    });
  }

  private async containerExists(containerId: string): Promise<boolean> {
    try {
      await this.docker.getContainer(containerId).inspect();
      return true;
    } catch {
      return false;
    }
  }

  private async ensureContainerRunning(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    const status = await container.inspect();
    if (!status.State.Running) {
      await container.start();
    }
  }

  private async resolveImage(image: string): Promise<ResolvedImage> {
    const approvedImage = this.resolveApprovedImage(image);
    const hasImage = (await this.docker.listImages()).some(
      (entry: ImageInfo) => {
        return (
          entry.RepoTags?.includes(approvedImage) ||
          entry.RepoDigests?.includes(approvedImage)
        );
      },
    );
    if (!hasImage) {
      await new Promise((resolve, reject) => {
        this.docker.pull(
          approvedImage,
          (error: Error | null, stream: NodeJS.ReadableStream) => {
            if (error) {
              reject(error);
              return;
            }
            this.docker.modem.followProgress(
              stream,
              (followError: Error | null, output: unknown) => {
                if (followError) {
                  reject(followError);
                  return;
                }
                resolve(output);
              },
            );
          },
        );
      });
    }
    const imageInfo = await this.docker.getImage(approvedImage).inspect();
    return {
      imageReference: approvedImage,
      imageDigest: imageInfo.RepoDigests?.[0] ?? imageInfo.Id,
    };
  }

  private resolveApprovedImage(requestedImage: string): string {
    if (requestedImage in this.options.allowedImages) {
      return this.options.allowedImages[requestedImage] ?? requestedImage;
    }
    if (Object.values(this.options.allowedImages).includes(requestedImage)) {
      return requestedImage;
    }
    throw new Error(`Unapproved container image "${requestedImage}"`);
  }

  private async validateRepo(repoPath: string): Promise<RepoIdentity> {
    const canonicalRepoPath = await fs.realpath(repoPath).catch(() => {
      throw new Error(`Repository path "${repoPath}" does not exist`);
    });
    if (isShadowPath(canonicalRepoPath, this.options)) {
      throw new Error(
        `Refusing to operate on shadow path "${canonicalRepoPath}"`,
      );
    }

    const insideWorkTree = (
      await this.execCommand('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: canonicalRepoPath,
      })
    ).stdout.trim();
    if (insideWorkTree !== 'true') {
      throw new Error(`Path "${canonicalRepoPath}" is not a git work tree`);
    }

    const isBare = (
      await this.execCommand('git', ['rev-parse', '--is-bare-repository'], {
        cwd: canonicalRepoPath,
      })
    ).stdout.trim();
    if (isBare === 'true') {
      throw new Error(
        `Refusing to operate on bare repository "${canonicalRepoPath}"`,
      );
    }

    const topLevel = path.resolve(
      canonicalRepoPath,
      (
        await this.execCommand('git', ['rev-parse', '--show-toplevel'], {
          cwd: canonicalRepoPath,
        })
      ).stdout.trim(),
    );
    if (topLevel !== canonicalRepoPath) {
      throw new Error(
        `Repository path "${repoPath}" must point at the canonical repository root`,
      );
    }

    const superproject = (
      await this.execCommand(
        'git',
        ['rev-parse', '--show-superproject-working-tree'],
        { cwd: canonicalRepoPath },
      ).catch(() => ({ stdout: '' }))
    ).stdout.trim();
    if (superproject.length > 0) {
      throw new Error(
        `Submodule roots are not supported: "${canonicalRepoPath}"`,
      );
    }

    const gitDir = (
      await this.execCommand('git', ['rev-parse', '--git-dir'], {
        cwd: canonicalRepoPath,
      })
    ).stdout.trim();
    const gitDirPath = path.resolve(canonicalRepoPath, gitDir);
    await this.refuseDangerousRepoState(gitDirPath);

    const baseCommitHash = (
      await this.execCommand('git', ['rev-parse', 'HEAD'], {
        cwd: canonicalRepoPath,
      })
    ).stdout.trim();
    return {
      canonicalRepoPath,
      baseCommitHash,
    };
  }

  private async refuseDangerousRepoState(gitDirPath: string): Promise<void> {
    const dangerousMarkers = [
      'MERGE_HEAD',
      'CHERRY_PICK_HEAD',
      'REVERT_HEAD',
      'BISECT_LOG',
      'index.lock',
    ];
    for (const marker of dangerousMarkers) {
      if (await pathExists(path.join(gitDirPath, marker))) {
        throw new Error(
          `Refusing to operate while repository has in-progress state: ${marker}`,
        );
      }
    }
    for (const rebaseDir of ['rebase-merge', 'rebase-apply']) {
      if (await pathExists(path.join(gitDirPath, rebaseDir))) {
        throw new Error(
          `Refusing to operate while repository has in-progress state: ${rebaseDir}`,
        );
      }
    }
  }

  private async readStatusEntries(
    worktreePath: string,
  ): Promise<StatusEntry[]> {
    const { stdout } = await this.execCommand(
      'git',
      ['status', '--porcelain=v1', '--untracked-files=all'],
      { cwd: worktreePath },
    );
    return stdout
      .split('\n')
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .map((line) => ({
        code: line.slice(0, 2),
        path: line.slice(3).split(' -> ').at(-1) ?? line.slice(3),
      }));
  }

  private async enforceChangeBudget(
    worktreePath: string,
    entries: StatusEntry[],
  ): Promise<void> {
    if (entries.length > this.options.maxChangedFiles) {
      throw new Error(
        `Refusing to checkpoint ${entries.length} changed files; limit is ${this.options.maxChangedFiles}`,
      );
    }
    let totalBytes = 0;
    for (const entry of entries) {
      const targetPath = path.join(worktreePath, entry.path);
      try {
        const stats = await fs.stat(targetPath);
        totalBytes += stats.size;
      } catch {
        // Deleted paths do not contribute bytes.
      }
    }
    if (totalBytes > this.options.maxChangedBytes) {
      throw new Error(
        `Refusing to checkpoint ${totalBytes} bytes of changed content; limit is ${this.options.maxChangedBytes}`,
      );
    }
  }

  private scanDiffForSecrets(diff: string): void {
    for (const pattern of this.options.sensitiveContentPatterns) {
      if (pattern.test(diff)) {
        throw new Error(
          `Refusing to checkpoint diff content matching sensitive pattern ${pattern}`,
        );
      }
    }
  }

  private isSensitivePath(candidatePath: string): boolean {
    const normalizedPath = candidatePath.replaceAll('\\', '/');
    return this.options.sensitivePathPatterns.some((pattern) =>
      pattern.test(normalizedPath),
    );
  }

  /** Maps execution env to `docker exec -e` flags; keys must pass {@link isAllowedEnvKey}. */
  private buildDockerExecEnvArgs(
    env: Record<string, string> | undefined,
  ): string[] {
    if (!env) {
      return [];
    }
    return Object.entries(env)
      .filter(([key]) => this.isAllowedEnvKey(key))
      .flatMap(([key, value]) => ['-e', `${key}=${value}`]);
  }

  /**
   * Env for the **host** `docker` CLI process (spawn). Separate from
   * {@link ShadowGitBridge.buildDockerExecEnvArgs}, which whitelists `-e` for the **container**.
   * Trusted-host infrastructure: forwards daemon connection (`DOCKER_*`) and basic paths only.
   */
  private buildDockerClientEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const key of [
      'PATH',
      'HOME',
      'TMPDIR',
      'DOCKER_HOST',
      'DOCKER_TLS_VERIFY',
      'DOCKER_CERT_PATH',
    ]) {
      if (process.env[key]) {
        env[key] = process.env[key];
      }
    }
    return env;
  }

  private isAllowedEnvKey(key: string): boolean {
    return (
      this.options.allowedDockerExecEnvKeys.includes(key) ||
      key.startsWith('DEUS_')
    );
  }

  private defaultContainerUser(): string {
    const uid = typeof process.getuid === 'function' ? process.getuid() : 65532;
    const gid = typeof process.getgid === 'function' ? process.getgid() : 65532;
    return `${uid}:${gid}`;
  }

  private assertWithinShadowRoot(
    shadowRootPath: string,
    worktreePath: string,
  ): void {
    const normalizedShadowRoot = path.resolve(shadowRootPath);
    const normalizedWorktree = path.resolve(worktreePath);
    if (
      normalizedWorktree !== normalizedShadowRoot &&
      !normalizedWorktree.startsWith(`${normalizedShadowRoot}${path.sep}`)
    ) {
      throw new Error(
        `Resolved worktree path "${normalizedWorktree}" escaped shadow root "${normalizedShadowRoot}"`,
      );
    }
  }

  private async pruneEmptyShadowRoot(shadowRootPath: string): Promise<void> {
    try {
      const manifests = await listSessionManifestPaths(shadowRootPath);
      const worktrees = await fs
        .readdir(worktreesDir(shadowRootPath))
        .catch(() => []);
      if (manifests.length === 0 && worktrees.length === 0) {
        await fs.rm(shadowRootPath, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup failures.
    }
  }

  private logicalSessionLockKey(repoPath: string, sessionId: string): string {
    return `${repoPath}::${sessionId}`;
  }

  private sessionLockKey(session: SessionInfo): string {
    return `${session.repoPath}::${session.internalSessionId}`;
  }

  private async withLock<T>(
    key: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.operationLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const next = previous.catch(() => {}).then(() => gate);
    this.operationLocks.set(key, next);
    await previous.catch(() => {});
    try {
      return await operation();
    } finally {
      release();
      if (this.operationLocks.get(key) === next) {
        this.operationLocks.delete(key);
      }
    }
  }

  private async execCommand(
    command: string,
    args: string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv },
  ): Promise<{ stdout: string; stderr: string }> {
    const result = spawnSync(command, args, {
      cwd: options.cwd,
      encoding: 'utf-8',
      env: options.env,
      shell: false,
    });

    if (result.status !== 0) {
      const stderr = result.stderr?.toString() || '';
      const stdout = result.stdout?.toString() || '';
      throw new Error(
        `Command "${command} ${args.join(' ')}" failed with code ${result.status}\nStdout: ${stdout}\nStderr: ${stderr}`,
      );
    }

    return {
      stdout: result.stdout?.toString() || '',
      stderr: result.stderr?.toString() || '',
    };
  }
}

function appendBoundedOutput(
  current: string,
  chunk: string,
  maxBytes: number,
): { value: string; truncated: boolean } {
  const combined = current + chunk;
  if (Buffer.byteLength(combined) <= maxBytes) {
    return { value: combined, truncated: false };
  }
  const truncated = truncateToLastBytes(combined, maxBytes);
  return { value: truncated, truncated: true };
}

function truncateToLastBytes(value: string, maxBytes: number): string {
  let result = value;
  while (Buffer.byteLength(result) > maxBytes) {
    result = result.slice(Math.ceil(result.length / 8));
  }
  return result;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isIgnorableDockerError(
  error: unknown,
  statusCodes: number[],
): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number' &&
    statusCodes.includes(error.statusCode)
  );
}
