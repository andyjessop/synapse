import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PiReviewFailedError } from 'agent-reviewer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSession = vi.hoisted(() => {
  const session = {
    prompt: vi.fn(),
    dispose: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    messages: [] as Array<{
      role: string;
      content: Array<{ type: string; text: string }>;
      stopReason: string;
      errorMessage?: string;
    }>,
  };
  return { session };
});

const createAgentSession = vi.hoisted(() =>
  vi.fn(async () => {
    mockSession.session.prompt.mockImplementation(async () => {
      mockSession.session.messages = [
        {
          role: 'assistant',
          content: [{ type: 'text', text: '## Summary\n\nok' }],
          stopReason: 'stop',
        },
      ];
    });
    return { session: mockSession.session };
  }),
);

const mockResourceLoader = vi.hoisted(() => ({
  reload: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@earendil-works/pi-coding-agent', () => ({
  AuthStorage: {
    create: vi.fn(() => ({
      setRuntimeApiKey: vi.fn(),
    })),
  },
  ModelRegistry: {
    create: vi.fn(() => ({
      find: vi.fn(() => ({ id: 'gpt-5.4-mini', provider: 'openai' })),
    })),
  },
  SessionManager: {
    inMemory: vi.fn(() => ({})),
  },
  DefaultResourceLoader: vi.fn(function MockDefaultResourceLoader() {
    return mockResourceLoader;
  }),
  getAgentDir: vi.fn(() => '/tmp/.pi/agent'),
  createAgentSession,
  defineTool: vi.fn((tool: { name: string }) => tool),
}));

import * as piCodingAgent from '@earendil-works/pi-coding-agent';
import { createPiReviewSdkClient } from '../../src/pi-review-sdk-client';

const mockGitlab = {
  fetchChanges: vi.fn(),
};

const baseRequest = {
  repoRoot: '/tmp/synapse-pi-test',
  prompt: 'Review this repo',
  promptVersion: 'review-pr.v2' as const,
  subject: 's',
  inputEventId: 'e1',
  gitlab: { projectId: 202, mergeRequestIid: 42 },
  emitHarnessEvent: vi.fn().mockResolvedValue(undefined),
};

describe('createPiReviewSdkClient', () => {
  beforeEach(() => {
    mockSession.session.subscribe.mockReset();
    mockSession.session.subscribe.mockImplementation(() => vi.fn());
    createAgentSession.mockClear();
  });

  it('returns markdown from the last assistant message', async () => {
    const repoRoot = '/tmp/synapse-pi-test';
    const client = createPiReviewSdkClient({
      repoRoot,
      gitlab: mockGitlab,
      env: {
        OPENAI_API_KEY: 'sk-test',
        PI_REVIEW_MODEL: 'openai/gpt-5.4-mini',
      },
      now: () => 0,
    });
    const result = await client.review({
      ...baseRequest,
      repoRoot,
    });
    expect(result.markdown).toContain('## Summary');
    expect(result.command).toBe('pi-sdk:createAgentSession');
    expect(result.cwd).toBe(repoRoot);
    expect(result.exitCode).toBe(0);
    expect(mockSession.session.dispose).toHaveBeenCalled();
    expect(mockResourceLoader.reload).toHaveBeenCalled();
    expect(createAgentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: repoRoot,
        resourceLoader: expect.objectContaining({
          reload: expect.any(Function),
        }),
        tools: expect.arrayContaining(['fetch_merge_request_diff']),
        customTools: expect.arrayContaining([
          expect.objectContaining({ name: 'fetch_merge_request_diff' }),
        ]),
      }),
    );
  });

  it('subscribes for stderr progress when PI_HARNESS_PROGRESS=1', async () => {
    const lines: string[] = [];
    mockSession.session.subscribe.mockImplementation((listener) => {
      listener({
        type: 'tool_execution_start',
        toolCallId: 't1',
        toolName: 'read',
        args: { path: 'README.md' },
      } as never);
      return vi.fn();
    });
    const client = createPiReviewSdkClient({
      repoRoot: '/tmp/synapse-pi-test',
      gitlab: mockGitlab,
      env: {
        OPENAI_API_KEY: 'sk-test',
        PI_REVIEW_MODEL: 'openai/gpt-5.4-mini',
        PI_HARNESS_PROGRESS: '1',
      },
      now: () => 0,
      progressEmitLine: (line) => lines.push(line),
    });
    await client.review({ ...baseRequest });
    expect(mockSession.session.subscribe).toHaveBeenCalled();
    expect(lines.some((l) => l.includes('read README.md'))).toBe(true);
  });

  it('writes snapshot when SYNAPSE_PI_HARNESS_PROGRESS_SNAPSHOT is set', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pi-sdk-snap-'));
    try {
      const snap = join(dir, 'progress.json');
      mockSession.session.subscribe.mockImplementation((listener) => {
        listener({
          type: 'tool_execution_start',
          toolCallId: 't1',
          toolName: 'read',
          args: { path: 'README.md' },
        } as never);
        return vi.fn();
      });
      const client = createPiReviewSdkClient({
        repoRoot: '/tmp/synapse-pi-test',
        gitlab: mockGitlab,
        env: {
          OPENAI_API_KEY: 'sk-test',
          PI_REVIEW_MODEL: 'openai/gpt-5.4-mini',
          PI_HARNESS_PROGRESS: '1',
          SYNAPSE_PI_HARNESS_PROGRESS_SNAPSHOT: snap,
        },
        now: () => 0,
      });
      await client.review({ ...baseRequest });
      const data = JSON.parse(readFileSync(snap, 'utf8')) as {
        lines: string[];
      };
      expect(data.lines).toEqual(['read README.md']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not subscribe when PI_HARNESS_PROGRESS is unset', async () => {
    mockSession.session.subscribe.mockClear();
    const client = createPiReviewSdkClient({
      repoRoot: '/tmp/synapse-pi-test',
      gitlab: mockGitlab,
      env: {
        OPENAI_API_KEY: 'sk-test',
        PI_REVIEW_MODEL: 'openai/gpt-5.4-mini',
      },
      now: () => 0,
    });
    await client.review({ ...baseRequest });
    expect(mockSession.session.subscribe).not.toHaveBeenCalled();
  });

  it('throws PiReviewFailedError when model is unknown', async () => {
    const find = vi.fn(() => undefined);
    vi.spyOn(piCodingAgent.ModelRegistry, 'create').mockReturnValueOnce({
      find,
    } as never);

    const client = createPiReviewSdkClient({
      repoRoot: '/r',
      gitlab: mockGitlab,
      env: { PI_REVIEW_MODEL: 'openai/unknown-model-xyz' },
    });
    await expect(
      client.review({
        repoRoot: '/r',
        prompt: 'p',
        promptVersion: 'review-pr.v2',
        subject: 's',
        inputEventId: 'e',
        gitlab: { projectId: 1, mergeRequestIid: 1 },
      }),
    ).rejects.toBeInstanceOf(PiReviewFailedError);
  });
});
