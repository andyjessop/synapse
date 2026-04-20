import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { devSessionFilePath, writeDevSession } from 'dev-cli-shared';

export { devSessionFilePath } from 'dev-cli-shared';
import { loadDotEnvLocal, parseRuntimeConfig } from 'runtime-config';
import {
  formatManifestStartupLine,
  parseRuntimeManifestFile,
  resolveManifestPath,
  resolveManifestWebhookRouteIds,
} from 'runtime-manifest';
import { createRuntimeStorePool, migrateRuntimeStore } from 'runtime-store';

const execFileAsync = promisify(execFile);

export type DevRuntimeProcess = {
  name: string;
  command: readonly string[];
  /** When false, a non-zero exit does not tear down relay/worker. Default: true for relay/worker only. */
  critical?: boolean;
};

export type DevRuntimeOptions = {
  /** Repo-relative or absolute manifest path. Defaults to `manifests/application.json`. */
  manifestPath?: string;
};

export type DevRuntimePlan = {
  repoRoot: string;
  stateDir: string;
  composeFile: string;
  env: NodeJS.ProcessEnv;
  options: DevRuntimeOptions;
  manifestPath: string;
  processes: readonly DevRuntimeProcess[];
};

export function resolveDevRepoRoot(
  metaUrl: string | URL = import.meta.url,
): string {
  return resolve(dirname(fileURLToPath(metaUrl)), '..');
}

export function parseDevCliArgs(argv: readonly string[]): DevRuntimeOptions {
  const options: DevRuntimeOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--manifest') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('-')) {
        throw new Error('--manifest requires a path argument');
      }
      options.manifestPath = value;
      i += 1;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown dev flag: ${arg}. Supported: --manifest <path>`);
    }
    throw new Error(`Unexpected dev argument: ${arg}`);
  }
  return options;
}

function processNamesIncludeWorker(
  processes: readonly DevRuntimeProcess[],
): boolean {
  return processes.some((p) => p.name === 'worker');
}

export function getDevRuntimeProcesses(): readonly DevRuntimeProcess[] {
  const processes: DevRuntimeProcess[] = [
    { name: 'worker', command: ['npx', 'nx', 'run', 'worker:start'] },
  ];

  if (processNamesIncludeWorker(processes)) {
    processes.push({
      name: 'webhooks',
      command: ['npx', 'nx', 'run', 'webhooks:start'],
    });
  }

  return processes;
}

export function createDevRuntimePlan(
  env: Record<string, string | undefined> = process.env,
  metaUrl: string | URL = import.meta.url,
  options: DevRuntimeOptions = {},
): DevRuntimePlan {
  const repoRoot = resolveDevRepoRoot(metaUrl);
  const stateDir = join(repoRoot, 'tmp', 'synapse-dev-state');
  const envWithLocal = loadDotEnvLocal(join(repoRoot, '.env.local'), {
    ...env,
  });
  const manifestPath = resolveManifestPath(repoRoot, envWithLocal, options.manifestPath);
  const manifest = parseRuntimeManifestFile(manifestPath);
  const webhookRoutes = resolveManifestWebhookRouteIds(manifest);

  const merged: NodeJS.ProcessEnv = {
    ...envWithLocal,
    STATE_DIR: envWithLocal.STATE_DIR ?? stateDir,
    SYNAPSE_RUNTIME_MANIFEST: manifestPath,
  };
  if (existsSync(repoRoot)) {
    mkdirSync(join(repoRoot, 'tmp', 'dev', 'runs'), { recursive: true });
    mkdirSync(join(repoRoot, '.synapse'), { recursive: true });
  }
  writeDevSession(repoRoot, {
    manifest_path: manifestPath,
    manifest_name: manifest.name,
    webhooks: {
      routes: webhookRoutes,
    },
  });

  return {
    repoRoot,
    stateDir,
    composeFile: join(repoRoot, 'local', 'docker-compose.yml'),
    options,
    manifestPath,
    env: merged,
    processes: getDevRuntimeProcesses(),
  };
}

export async function migrateDevRuntimeStore(
  plan: DevRuntimePlan,
): Promise<void> {
  const config = parseRuntimeConfig(plan.env);
  const pool = createRuntimeStorePool({
    databaseUrl: config.databaseUrl,
    max: 2,
  });
  try {
    await migrateRuntimeStore(pool);
  } finally {
    await pool.end();
  }
}

export async function ensureDevInfra(plan: DevRuntimePlan): Promise<void> {
  await execFileAsync(
    'docker',
    ['compose', '-f', plan.composeFile, 'up', '-d', '--wait'],
    {
      cwd: plan.repoRoot,
      env: plan.env,
    },
  );
}

export async function runDevInfraDoctor(plan: DevRuntimePlan): Promise<void> {
  await execFileAsync('npx', ['tsx', 'scripts/dev-infra-doctor.ts'], {
    cwd: plan.repoRoot,
    env: plan.env,
  });
}

export function formatDevStartupBanner(plan: DevRuntimePlan): string {
  const lines = [
    'Synapse local development stack is running.',
    '',
    'Services:',
  ];

  lines.push(
    '  Postgres  127.0.0.1:25432',
    '  Redis     127.0.0.1:26379',
    '  OTLP HTTP http://127.0.0.1:24318',
    '  Jaeger    http://127.0.0.1:26686',
  );

  lines.push('  Webhooks  http://127.0.0.1:3102 (see apps/webhooks/README.md)');

  lines.push(
    '  Runtime logs appear below (Ctrl+C stops all processes).',
    '',
    'Echo example: npm run dev -- --manifest manifests/examples/echo.json',
    'Then: npm run dev:once -- --fixture example/echo',
    'Application: npm run dev:once -- --fixture review-pr/gitlab-synapse',
    'Stop infrastructure: npm run dev:infra:down',
  );

  return `${lines.join('\n')}\n`;
}

export async function startDevRuntime(
  plan: DevRuntimePlan = createDevRuntimePlan(),
): Promise<void> {
  mkdirSync(plan.stateDir, { recursive: true });

  process.stdout.write(`${formatManifestStartupLine(plan.manifestPath)}\n`);

  process.stdout.write('Starting local infrastructure (Docker Compose)...\n');
  await ensureDevInfra(plan);
  process.stdout.write('Checking infrastructure health...\n');
  await runDevInfraDoctor(plan);

  process.stdout.write(
    'Applying runtime store migrations and verifying Postgres schema...\n',
  );
  await migrateDevRuntimeStore(plan);

  const devEnv = plan.env;

  const processes: ChildProcess[] = [];
  let shuttingDown = false;

  function startProcess(runtimeProcess: DevRuntimeProcess): ChildProcess {
    const [bin, ...args] = runtimeProcess.command;
    const child = spawn(bin, args, {
      cwd: plan.repoRoot,
      env: devEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (chunk) =>
      writePrefixed(runtimeProcess.name, chunk),
    );
    child.stderr?.on('data', (chunk) =>
      writePrefixed(runtimeProcess.name, chunk, true),
    );
    child.on('error', (error) => {
      process.stderr.write(
        `[${runtimeProcess.name}] failed to start: ${error.message}\n`,
      );
      if (!shuttingDown) {
        shutdown(1);
      }
    });
    child.on('exit', (code, signal) => {
      const detail = signal === null ? `exit ${code}` : `signal ${signal}`;
      process.stderr.write(`[${runtimeProcess.name}] stopped (${detail})\n`);
      const critical =
        runtimeProcess.critical ?? isDevCriticalProcess(runtimeProcess.name);
      if (!shuttingDown && code !== 0 && critical) {
        shutdown(code ?? 1);
      }
    });
    return child;
  }

  for (const runtimeProcess of plan.processes) {
    processes.push(startProcess(runtimeProcess));
  }

  function shutdown(exitCode = 0): void {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    for (const child of processes) {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    }
    setTimeout(() => {
      for (const child of processes) {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }
      process.exit(exitCode);
    }, 5_000).unref();
  }

  process.once('SIGINT', () => shutdown(0));
  process.once('SIGTERM', () => shutdown(0));

  process.stdout.write(formatDevStartupBanner(plan));
}

export function isDevCriticalProcess(name: string): boolean {
  return name === 'worker';
}

function writePrefixed(name: string, chunk: Buffer, stderr = false): void {
  const stream = stderr ? process.stderr : process.stdout;
  for (const line of chunk.toString('utf8').split(/\r?\n/)) {
    if (line !== '') {
      stream.write(`[${name}] ${line}\n`);
    }
  }
}

export function isDirectRun(
  metaUrl: string | URL = import.meta.url,
  argv: NodeJS.Process['argv'] = process.argv,
): boolean {
  const scriptPath = argv[1];
  return (
    scriptPath !== undefined && resolve(scriptPath) === fileURLToPath(metaUrl)
  );
}

if (isDirectRun()) {
  const options = parseDevCliArgs(process.argv.slice(2));
  const plan = createDevRuntimePlan(process.env, import.meta.url, options);
  startDevRuntime(plan).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
