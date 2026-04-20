import { EventEmitter } from 'node:events';
import { PiReviewFailedError, PiReviewUnavailableError } from 'agent-reviewer';
import { describe, expect, it, vi } from 'vitest';
import {
  createPiReviewProcessClient,
  parsePiJsonLines,
  parsePiStdout,
} from '../../src/pi-review-process-client';

describe('parsePiStdout', () => {
  it('extracts assistant text from JSON lines', () => {
    const stdout = [
      '{"type":"assistant","message":{"content":"## Summary\\nLooks good."}}',
    ].join('\n');
    expect(parsePiJsonLines(stdout)).toContain('Looks good');
    expect(parsePiStdout(stdout)).toContain('Looks good');
  });

  it('falls back to raw stdout when JSON parsing fails', () => {
    expect(parsePiStdout('plain markdown')).toBe('plain markdown');
  });
});

describe('createPiReviewProcessClient', () => {
  it('invokes pi without shell and maps success output', async () => {
    const spawn = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        kill: ReturnType<typeof vi.fn>;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = vi.fn();
      queueMicrotask(() => {
        child.stdout.emit(
          'data',
          Buffer.from(
            '{"type":"assistant","message":{"content":"## Summary\\nOK"}}',
          ),
        );
        child.emit('close', 0);
      });
      return child;
    });

    const client = createPiReviewProcessClient({
      repoRoot: '/repo',
      spawn: spawn as never,
    });
    const result = await client.review({
      repoRoot: '/repo',
      prompt: 'review this',
      promptVersion: 'review-pr.v2',
      subject: 'gitlab:andy/synapse!1',
      inputEventId: 'evt-1',
      gitlab: { projectId: 202, mergeRequestIid: 42 },
    });

    expect(spawn).toHaveBeenCalledWith(
      'pi',
      ['-p', 'review this', '--mode', 'json'],
      expect.objectContaining({ cwd: '/repo', shell: false }),
    );
    expect(result.exitCode).toBe(0);
    expect(result.markdown).toContain('OK');
  });

  it('throws PiReviewUnavailableError when executable is missing', async () => {
    const spawn = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        kill: ReturnType<typeof vi.fn>;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = vi.fn();
      queueMicrotask(() => {
        const error = new Error('spawn pi ENOENT') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        child.emit('error', error);
      });
      return child;
    });

    const client = createPiReviewProcessClient({
      repoRoot: '/repo',
      spawn: spawn as never,
    });
    await expect(
      client.review({
        repoRoot: '/repo',
        prompt: 'x',
        promptVersion: 'review-pr.v2',
        subject: 's',
        inputEventId: 'evt',
        gitlab: { projectId: 202, mergeRequestIid: 42 },
      }),
    ).rejects.toBeInstanceOf(PiReviewUnavailableError);
  });

  it('throws PiReviewFailedError on non-zero exit', async () => {
    const spawn = vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        kill: ReturnType<typeof vi.fn>;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = vi.fn();
      queueMicrotask(() => {
        child.stderr.emit('data', Buffer.from('boom'));
        child.emit('close', 2);
      });
      return child;
    });

    const client = createPiReviewProcessClient({
      repoRoot: '/repo',
      spawn: spawn as never,
    });
    await expect(
      client.review({
        repoRoot: '/repo',
        prompt: 'x',
        promptVersion: 'review-pr.v2',
        subject: 's',
        inputEventId: 'evt',
        gitlab: { projectId: 202, mergeRequestIid: 42 },
      }),
    ).rejects.toBeInstanceOf(PiReviewFailedError);
  });
});
