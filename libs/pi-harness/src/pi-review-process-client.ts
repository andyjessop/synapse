import {
  type ChildProcessWithoutNullStreams,
  spawn as nodeSpawn,
} from 'node:child_process';
import type { Tracer } from '@opentelemetry/api';
import type {
  PiReviewClient,
  PiReviewRequest,
  PiReviewResult,
} from 'agent-reviewer';
import { PiReviewFailedError, PiReviewUnavailableError } from 'agent-reviewer';
import { type RuntimeMetrics, runWithRuntimeSpan } from 'runtime-observability';

const PREVIEW_LIMIT = 64 * 1024;

export type CreatePiReviewProcessClientInput = {
  repoRoot: string;
  executable?: string;
  env?: NodeJS.ProcessEnv;
  spawn?: typeof nodeSpawn;
  now?: () => number;
  tracer?: Tracer;
  metrics?: RuntimeMetrics;
};

export function createPiReviewProcessClient(
  input: CreatePiReviewProcessClientInput,
): PiReviewClient {
  const spawnFn = input.spawn ?? nodeSpawn;
  const now = input.now ?? (() => Date.now());
  const executable = input.executable ?? 'pi';

  return {
    repoRoot: input.repoRoot,
    review: async (request) =>
      runPiReview({
        request,
        repoRoot: input.repoRoot,
        executable,
        env: input.env,
        spawnFn,
        now,
        tracer: input.tracer,
        metrics: input.metrics,
      }),
  };
}

async function runPiReview(options: {
  request: PiReviewRequest;
  repoRoot: string;
  executable: string;
  env?: NodeJS.ProcessEnv;
  spawnFn: typeof nodeSpawn;
  now: () => number;
  tracer?: Tracer;
  metrics?: RuntimeMetrics;
}): Promise<PiReviewResult> {
  const run = async (): Promise<PiReviewResult> => {
    const command = `${options.executable} -p <prompt> --mode json`;
    const started = options.now();
    try {
      const { stdout, stderr, exitCode } = await spawnPiProcess(options);
      const durationMs = options.now() - started;
      const stdoutBytes = Buffer.byteLength(stdout, 'utf8');
      const stderrBytes = Buffer.byteLength(stderr, 'utf8');
      if (exitCode !== 0) {
        throw new PiReviewFailedError(
          `Pi review exited with code ${exitCode}`,
          exitCode,
          boundPreview(stderr),
        );
      }
      const markdown = parsePiStdout(stdout);
      if (markdown.trim() === '') {
        throw new PiReviewFailedError(
          'Pi review produced empty output',
          exitCode,
        );
      }
      options.metrics?.recordAdapter({
        adapter: 'pi',
        operation: 'review_pr',
        result: 'success',
      });
      return {
        markdown,
        command,
        cwd: options.repoRoot,
        exitCode,
        durationMs,
        stdoutBytes,
        stderrBytes,
      };
    } catch (error) {
      options.metrics?.recordAdapter({
        adapter: 'pi',
        operation: 'review_pr',
        result: 'failure',
      });
      throw error;
    }
  };

  if (options.tracer === undefined) {
    return run();
  }

  return runWithRuntimeSpan({
    tracer: options.tracer,
    hop: 'adapter.request',
    adapter: 'pi',
    operation: 'review_pr',
    run,
  });
}

async function spawnPiProcess(options: {
  request: PiReviewRequest;
  repoRoot: string;
  executable: string;
  env?: NodeJS.ProcessEnv;
  spawnFn: typeof nodeSpawn;
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = options.spawnFn(
        options.executable,
        ['-p', options.request.prompt, '--mode', 'json'],
        {
          cwd: options.repoRoot,
          env: options.env ?? process.env,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      ) as unknown as ChildProcessWithoutNullStreams;
    } catch (error) {
      reject(mapSpawnError(error, options.executable));
      return;
    }

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      reject(mapSpawnError(error, options.executable));
    });

    child.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });
  });
}

function mapSpawnError(error: unknown, executable: string): Error {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  ) {
    return new PiReviewUnavailableError(
      `Pi executable "${executable}" is not available on PATH. Install the Pi coding agent from https://pi.dev/`,
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

export function parsePiStdout(stdout: string): string {
  const parsed = parsePiJsonLines(stdout);
  if (parsed !== undefined && parsed.trim() !== '') {
    return parsed;
  }
  return stdout.trim();
}

export function parsePiJsonLines(stdout: string): string | undefined {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  let lastText: string | undefined;
  for (const line of lines) {
    try {
      const value = JSON.parse(line) as Record<string, unknown>;
      if (typeof value.text === 'string' && value.text.trim() !== '') {
        lastText = value.text;
      }
      if (value.type === 'message' && typeof value.content === 'string') {
        lastText = value.content;
      }
      if (
        value.type === 'assistant' &&
        typeof value.message === 'object' &&
        value.message !== null &&
        typeof (value.message as { content?: string }).content === 'string'
      ) {
        lastText = (value.message as { content: string }).content;
      }
    } catch {
      // ignore non-JSON lines
    }
  }
  return lastText;
}

function boundPreview(value: string): string {
  if (value.length <= PREVIEW_LIMIT) {
    return value;
  }
  return value.slice(0, PREVIEW_LIMIT);
}
