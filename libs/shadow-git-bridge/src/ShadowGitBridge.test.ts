import type { SpawnOptions, SpawnSyncOptions } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShadowGitBridge } from './ShadowGitBridge';
import {
  DEFAULT_SHADOW_ROOT_NAME,
  getShadowPathSegment,
  getShadowRootName,
  getShadowRootPath,
  isShadowPath,
} from './shadowPaths';

const dockerState = vi.hoisted(() => ({
  imageInspect: {
    Id: 'sha256:image-id',
    RepoDigests: ['alpine/git@sha256:pinned'],
  },
  containerRunning: true,
  containerId: 'cid',
}));

type DockerPullCallback = (err: Error | null, stream: unknown) => void;
type DockerProgressCallback = (err: Error | null, output: unknown) => void;

vi.mock('dockerode', () => {
  const mockContainer = {
    get id() {
      return dockerState.containerId;
    },
    start: vi.fn(() => Promise.resolve({})),
    stop: vi.fn(() => Promise.resolve({})),
    remove: vi.fn(() => Promise.resolve({})),
    inspect: vi.fn(() =>
      Promise.resolve({ State: { Running: dockerState.containerRunning } }),
    ),
  };
  const mockDocker = {
    createContainer: vi.fn(() => Promise.resolve(mockContainer)),
    getContainer: vi.fn(() => mockContainer),
    listImages: vi.fn(() =>
      Promise.resolve([
        {
          RepoTags: ['alpine/git:v2.49.1'],
          RepoDigests: dockerState.imageInspect.RepoDigests,
        },
      ]),
    ),
    pull: vi.fn((_img: string, cb: DockerPullCallback) => cb(null, {})),
    getImage: vi.fn(() => ({
      inspect: vi.fn(() => Promise.resolve(dockerState.imageInspect)),
    })),
    modem: {
      followProgress: vi.fn((_stream: unknown, cb: DockerProgressCallback) =>
        cb(null, {}),
      ),
    },
  };
  return {
    default: class MockDocker {
      constructor() {
        return mockDocker;
      }
    },
  };
});

type GitState = {
  repoHead: string;
  sessionHeads: Map<string, string>;
  statusByCwd: Map<string, string>;
  stagedDiffByCwd: Map<string, string>;
  refs: Map<string, string>;
  commitCounter: number;
  diffBaseArgs: string[];
};

const childProcessMocks = vi.hoisted(() => ({
  repoPath: '',
  gitState: null as GitState | null,
  spawnSync: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawnSync: (...args: Parameters<typeof actual.spawnSync>) =>
      childProcessMocks.spawnSync(...args) as ReturnType<
        typeof actual.spawnSync
      >,
    spawn: (...args: Parameters<typeof actual.spawn>) =>
      childProcessMocks.spawn(...args) as ReturnType<typeof actual.spawn>,
  };
});

describe('ShadowGitBridge', () => {
  let bridge: ShadowGitBridge;
  let repoPath: string;
  let gitState: GitState;

  beforeEach(async () => {
    childProcessMocks.spawnSync.mockReset();
    childProcessMocks.spawn.mockReset();
    repoPath = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'shadow-bridge-test-')),
    );
    await fs.mkdir(path.join(repoPath, '.git'), { recursive: true });
    await fs.writeFile(path.join(repoPath, 'README.md'), 'root\n', 'utf8');
    gitState = {
      repoHead: 'basehash',
      sessionHeads: new Map(),
      statusByCwd: new Map(),
      stagedDiffByCwd: new Map(),
      refs: new Map(),
      commitCounter: 0,
      diffBaseArgs: [],
    };
    childProcessMocks.repoPath = repoPath;
    childProcessMocks.gitState = gitState;
    childProcessMocks.spawnSync.mockImplementation(((
      command: string,
      args?: readonly string[],
      options?: SpawnSyncOptions,
    ) => {
      const cwd =
        typeof options === 'object' &&
        options !== null &&
        'cwd' in options &&
        typeof options.cwd === 'string'
          ? options.cwd
          : childProcessMocks.repoPath;
      if (command !== 'git') {
        return successResult('');
      }
      const argv = Array.isArray(args) ? args : [];
      if (argv[0] === 'rev-parse' && argv[1] === '--is-inside-work-tree') {
        return successResult('true\n');
      }
      if (argv[0] === 'rev-parse' && argv[1] === '--is-bare-repository') {
        return successResult('false\n');
      }
      if (argv[0] === 'rev-parse' && argv[1] === '--show-toplevel') {
        return successResult(`${repoPath}\n`);
      }
      if (
        argv[0] === 'rev-parse' &&
        argv[1] === '--show-superproject-working-tree'
      ) {
        return successResult('\n');
      }
      if (argv[0] === 'rev-parse' && argv[1] === '--git-dir') {
        return successResult('.git\n');
      }
      if (argv[0] === 'rev-parse' && argv[1] === 'HEAD') {
        return successResult(
          `${gitState.sessionHeads.get(cwd) ?? gitState.repoHead}\n`,
        );
      }
      if (argv[0] === 'check-ref-format') {
        return successResult('ok\n');
      }
      if (argv[0] === 'worktree' && argv[1] === 'add') {
        const worktreePath = String(argv[4]);
        const baseHash = String(argv[5] ?? gitState.repoHead);
        void fs.mkdir(worktreePath, { recursive: true });
        gitState.sessionHeads.set(worktreePath, baseHash);
        return successResult('');
      }
      if (argv[0] === 'worktree' && argv[1] === 'remove') {
        const worktreePath = String(argv[3]);
        void fs.rm(worktreePath, { recursive: true, force: true });
        gitState.sessionHeads.delete(worktreePath);
        return successResult('');
      }
      if (argv[0] === 'checkout' && argv[1] === '-B') {
        return successResult('');
      }
      if (argv[0] === 'update-ref') {
        if (argv[1] === '-d') {
          gitState.refs.delete(String(argv[2]));
        } else {
          gitState.refs.set(String(argv[1]), String(argv[2]));
        }
        return successResult('');
      }
      if (argv[0] === 'status') {
        return successResult(`${gitState.statusByCwd.get(cwd) ?? ''}`);
      }
      if (argv[0] === 'add') {
        return successResult('');
      }
      if (
        argv[0] === 'diff' &&
        argv[1] === '--cached' &&
        argv[2] === '--name-only'
      ) {
        return successResult(
          buildStagedNames(gitState.statusByCwd.get(cwd) ?? ''),
        );
      }
      if (argv[0] === 'diff' && argv[1] === '--cached') {
        return successResult(gitState.stagedDiffByCwd.get(cwd) ?? '');
      }
      if (
        argv[0] === 'diff' &&
        argv[1] === '--name-only' &&
        argv.length === 3
      ) {
        gitState.diffBaseArgs.push(String(argv[2]));
        return successResult('a.ts\n');
      }
      if (
        argv[0] === 'diff' &&
        argv[1] !== '--cached' &&
        argv[1] !== '--name-only' &&
        argv.length === 2
      ) {
        gitState.diffBaseArgs.push(String(argv[1]));
        return successResult(`diff:${String(argv[1])}\n`);
      }
      if (
        argv[0] === 'diff' &&
        argv[1] !== '--cached' &&
        argv[1] !== '--name-only' &&
        argv.length >= 3
      ) {
        gitState.diffBaseArgs.push(String(argv[1]));
        return successResult(`diff:${String(argv[1])}\n`);
      }
      if (argv[0] === 'commit') {
        gitState.commitCounter += 1;
        const nextHash = `hash${gitState.commitCounter}`;
        gitState.sessionHeads.set(cwd, nextHash);
        return successResult(`[${nextHash}] checkpoint\n`);
      }
      if (argv[0] === 'for-each-ref') {
        const prefix = String(argv[3] ?? '');
        return successResult(
          `${[...gitState.refs.keys()]
            .filter((ref) => ref.startsWith(prefix))
            .join('\n')}\n`,
        );
      }
      if (argv[0] === 'branch' && argv[1] === '-D') {
        return successResult('');
      }
      if (argv[0] === 'reset' && argv[1] === '--hard') {
        gitState.sessionHeads.set(cwd, String(argv[2]));
        return successResult('');
      }
      if (argv[0] === 'clean' && argv[1] === '-fd') {
        return successResult('');
      }
      if (argv[0] === 'apply') {
        return successResult('');
      }
      return successResult('');
    }) as ReturnType<typeof childProcessMocks.spawnSync>);

    bridge = new ShadowGitBridge();
  });

  afterEach(async () => {
    await fs.rm(repoPath, { recursive: true, force: true }).catch(() => {});
    delete process.env.SHOULD_NOT_LEAK;
  });

  it('uses a neutral default shadow root', () => {
    expect(DEFAULT_SHADOW_ROOT_NAME).toBe('.deus-shadow');
    expect(getShadowRootName()).toBe('.deus-shadow');
    expect(getShadowPathSegment()).toBe('/.deus-shadow/');
    expect(getShadowRootPath('/repo')).toMatch(
      /^\/\.deus-shadow\/repo-[0-9a-f]{12}$/,
    );
    expect(isShadowPath('/tmp/.deus-shadow/repo-123/worktrees/goal-1')).toBe(
      true,
    );
    expect(getShadowRootPath('/repo')).not.toMatch(/^\/repo\//);
  });

  it('supports a custom shadow root name', () => {
    const customOptions = { shadowRootName: 'ask-shadow' } as const;
    expect(getShadowRootName(customOptions)).toBe('ask-shadow');
    expect(getShadowRootPath('/repo', customOptions)).toMatch(
      /^\/ask-shadow\/repo-[0-9a-f]{12}$/,
    );
    expect(
      isShadowPath('/repo/ask-shadow/worktrees/goal-1', customOptions),
    ).toBe(true);
    expect(isShadowPath('/repo/deus-shadow/goal-1', customOptions)).toBe(true);
  });

  it('rejects hostile session ids', async () => {
    await expect(
      bridge.createSession(repoPath, '../escape', 'git-runner'),
    ).rejects.toThrow('Invalid sessionId "../escape"');
  });

  it('creates a worktree-backed session outside the repo', async () => {
    const session = await bridge.createSession(
      repoPath,
      'goal-1',
      'git-runner',
    );
    expect(session.sessionId).toBe('goal-1');
    expect(session.worktreePath).toContain(
      `${path.sep}.deus-shadow${path.sep}`,
    );
    expect(session.worktreePath.startsWith(`${repoPath}${path.sep}`)).toBe(
      false,
    );
    expect(session.branchRef).toContain('refs/heads/deus-shadow/session/');
    expect(session.branchRef.includes('goal-1')).toBe(false);
    expect(session.containerId).toBe(dockerState.containerId);
  });

  it('rejects repos that already live under a shadow root', async () => {
    const shadowRepo = path.join(
      os.tmpdir(),
      '.deus-shadow',
      'shadowrepo-test',
      'repo',
    );
    await fs.mkdir(shadowRepo, { recursive: true });
    const canonicalShadowRepo = await fs.realpath(shadowRepo);
    try {
      await expect(
        bridge.createSession(canonicalShadowRepo, 'goal-1', 'git-runner'),
      ).rejects.toThrow('Refusing to operate on shadow path');
    } finally {
      await fs.rm(canonicalShadowRepo, { recursive: true, force: true });
    }
  });

  it('enforces an approved image policy', async () => {
    await expect(
      bridge.createSession(repoPath, 'goal-1', 'ubuntu:latest'),
    ).rejects.toThrow('Unapproved container image "ubuntu:latest"');
  });

  it('syncs append-only checkpoints and records refs', async () => {
    const session = await bridge.createSession(
      repoPath,
      'goal-1',
      'git-runner',
    );
    await fs.writeFile(
      path.join(session.worktreePath, 'file.ts'),
      'export {};\n',
    );
    gitState.statusByCwd.set(session.worktreePath, '?? file.ts\n');
    gitState.stagedDiffByCwd.set(
      session.worktreePath,
      'diff --git a/file.ts b/file.ts\n+export {};\n',
    );

    const checkpoint = await bridge.sync(session, { label: 'first-pass' });
    expect(checkpoint.hash).toBe('hash1');
    expect(checkpoint.sequence).toBe(1);
    expect(checkpoint.ref).toContain('/000001');

    const checkpoints = await bridge.listCheckpoints(session);
    expect(checkpoints.map((entry) => entry.kind)).toEqual([
      'base',
      'checkpoint',
    ]);
  });

  it('checkpoints after execute and strips host env leakage', async () => {
    const session = await bridge.createSession(
      repoPath,
      'goal-1',
      'git-runner',
    );
    await fs.writeFile(
      path.join(session.worktreePath, 'file.ts'),
      "console.log('x');\n",
    );
    gitState.statusByCwd.set(session.worktreePath, '?? file.ts\n');
    gitState.stagedDiffByCwd.set(
      session.worktreePath,
      "diff --git a/file.ts b/file.ts\n+console.log('x');\n",
    );

    const stdout = new Readable({
      read() {
        this.push('ok');
        this.push(null);
      },
    });
    const stderr = new Readable({
      read() {
        this.push(null);
      },
    });
    let spawnedArgs: string[] = [];
    let spawnedEnv: NodeJS.ProcessEnv | undefined;
    process.env.SHOULD_NOT_LEAK = 'secret';

    childProcessMocks.spawn.mockImplementation(((
      _command: string,
      args?: readonly string[],
      options?: SpawnOptions,
    ) => {
      spawnedArgs = Array.isArray(args) ? args.map(String) : [];
      spawnedEnv =
        typeof options === 'object' && options !== null && 'env' in options
          ? (options.env as NodeJS.ProcessEnv)
          : undefined;
      return {
        stdout,
        stderr,
        on(event: string, callback: (code?: number) => void) {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return this;
        },
        kill() {
          return true;
        },
      } as unknown as ReturnType<typeof childProcessMocks.spawn>;
    }) as ReturnType<typeof childProcessMocks.spawn>);

    const stream = bridge.execute(session, {
      command: ['echo', 'ok'],
      checkpointOnSuccess: true,
      env: {
        DEUS_TRACE: '1',
        SHOULD_NOT_PASS: 'bad',
      },
    });

    const result = await stream.result;
    expect(typeof stream.kill).toBe('function');
    expect(result.exitCode).toBe(0);
    expect(result.preExecutionHash).toBe('basehash');
    expect(result.commitHash).toBe('hash1');
    expect(result.postExecutionHash).toBe('hash1');
    expect(spawnedArgs).toContain('-e');
    expect(spawnedArgs).toContain('DEUS_TRACE=1');
    expect(spawnedArgs).not.toContain('SHOULD_NOT_PASS=bad');
    expect(spawnedEnv?.SHOULD_NOT_LEAK).toBeUndefined();
  });

  it('diffs against the explicit session base even if repo head moves', async () => {
    const session = await bridge.createSession(
      repoPath,
      'goal-1',
      'git-runner',
    );
    gitState.repoHead = 'new-repo-head';
    const diff = await bridge.getDiff(repoPath, session);
    expect(diff).toContain('diff:basehash');
    expect(gitState.diffBaseArgs.at(-1)).toBe('basehash');
  });

  it('getDiff does not create a checkpoint', async () => {
    const session = await bridge.createSession(
      repoPath,
      'goal-1',
      'git-runner',
    );
    const before = gitState.commitCounter;
    await bridge.getDiff(repoPath, session);
    expect(gitState.commitCounter).toBe(before);
  });

  it('getDiffSinceCheckpoint does not sync and diffs checkpoint vs worktree', async () => {
    const session = await bridge.createSession(
      repoPath,
      'goal-1',
      'git-runner',
    );
    const slice = await bridge.getDiffSinceCheckpoint(session, 'hash0');
    expect(slice).toContain('diff:hash0');
  });

  it('execute without checkpointOnSuccess does not create a checkpoint', async () => {
    const session = await bridge.createSession(
      repoPath,
      'goal-1',
      'git-runner',
    );
    await fs.writeFile(
      path.join(session.worktreePath, 'file.ts'),
      "console.log('x');\n",
    );
    gitState.statusByCwd.set(session.worktreePath, '?? file.ts\n');
    gitState.stagedDiffByCwd.set(
      session.worktreePath,
      "diff --git a/file.ts b/file.ts\n+console.log('x');\n",
    );

    const stdout = new Readable({
      read() {
        this.push(null);
      },
    });
    const stderr = new Readable({
      read() {
        this.push(null);
      },
    });
    childProcessMocks.spawn.mockImplementation(((
      _command: string,
      _args?: readonly string[],
    ) => {
      return {
        stdout,
        stderr,
        on(event: string, callback: (code?: number) => void) {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return this;
        },
        kill() {
          return true;
        },
      } as unknown as ReturnType<typeof childProcessMocks.spawn>;
    }) as ReturnType<typeof childProcessMocks.spawn>);

    const before = gitState.commitCounter;
    const stream = bridge.execute(session, {
      command: ['true'],
      checkpointOnSuccess: false,
    });
    await stream.result;
    expect(gitState.commitCounter).toBe(before);
  });

  it('executeAndWait returns buffered execution summary', async () => {
    const session = await bridge.createSession(
      repoPath,
      'goal-1',
      'git-runner',
    );
    const stdout = new Readable({
      read() {
        this.push('out');
        this.push(null);
      },
    });
    const stderr = new Readable({
      read() {
        this.push(null);
      },
    });
    childProcessMocks.spawn.mockImplementation(((
      _command: string,
      _args?: readonly string[],
    ) => {
      return {
        stdout,
        stderr,
        on(event: string, callback: (code?: number) => void) {
          if (event === 'close') {
            setTimeout(() => callback(0), 0);
          }
          return this;
        },
        kill() {
          return true;
        },
      } as unknown as ReturnType<typeof childProcessMocks.spawn>;
    }) as ReturnType<typeof childProcessMocks.spawn>);

    const summary = await bridge.executeAndWait(session, {
      command: ['echo', 'x'],
      checkpointOnSuccess: false,
    });
    expect(summary.exitCode).toBe(0);
    expect(summary.stdout).toBe('out');
  });

  it('can promote and roll back checkpoints using manifest metadata', async () => {
    const session = await bridge.createSession(
      repoPath,
      'goal-1',
      'git-runner',
    );
    await fs.writeFile(path.join(session.worktreePath, 'file.ts'), 'one\n');
    gitState.statusByCwd.set(session.worktreePath, '?? file.ts\n');
    gitState.stagedDiffByCwd.set(
      session.worktreePath,
      'diff --git a/file.ts b/file.ts\n+one\n',
    );
    const checkpoint = await bridge.sync(session, { label: 'checkpoint-a' });
    const promoted = await bridge.promoteCheckpoint(session, {
      label: 'ready',
    });
    expect(promoted.hash).toBe(checkpoint.hash);

    const rolledBack = await bridge.rollbackToCheckpoint(
      session,
      checkpoint.hash,
    );
    expect(rolledBack.hash).toBe(checkpoint.hash);
  });
});

function buildStagedNames(statusOutput: string): string {
  return statusOutput
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3).split(' -> ').at(-1) ?? line.slice(3))
    .join('\n');
}

function successResult(stdout: string) {
  return {
    status: 0,
    stdout: Buffer.from(stdout),
    stderr: Buffer.from(''),
  } as unknown as ReturnType<typeof childProcessMocks.spawnSync>;
}
