import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isAgentHandler } from 'runtime-agent';
import { getRepoRoot } from 'runtime-config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gitlabMergeRequestWebhookSchema } from '../../src/gitlab-webhook.js';
import { normalizeGitLabMergeRequestWebhook } from '../../src/ingress.js';
import type { PiReviewClient } from '../../src/pi-review-client.js';
import { PiReviewFailedError } from '../../src/pi-review-client.js';
import reviewPrAgent, {
  resetReviewPrPiClientForTest,
  reviewPrReviewedExternalId,
  setReviewPrPiClient,
} from '../../src/review-pr-agent.js';
import { readPiReviewMarkdownFixture } from '../fixture-data.js';

const fixtureDir = join(
  getRepoRoot(import.meta.url),
  'fixtures/agent-reviewer',
);

function fixtureReceivedData() {
  const raw = readFileSync(
    join(fixtureDir, 'gitlab-merge-request.json'),
    'utf8',
  );
  const payload = gitlabMergeRequestWebhookSchema.parse(JSON.parse(raw));
  return normalizeGitLabMergeRequestWebhook(payload);
}

describe('review-pr-agent', () => {
  afterEach(() => {
    resetReviewPrPiClientForTest();
  });

  it('default export is an agent handler', () => {
    expect(isAgentHandler(reviewPrAgent)).toBe(true);
  });

  it('builds stable reviewed external ids', () => {
    const data = fixtureReceivedData();
    expect(reviewPrReviewedExternalId(data, 'evt-1')).toContain(
      `:${data.merge_request.last_commit_sha}:review-pr.v2:evt-1`,
    );
  });

  it('emits pr.reviewed.v1 when Pi returns markdown', async () => {
    const data = fixtureReceivedData();
    const markdown = readPiReviewMarkdownFixture(fixtureDir);
    const review = vi.fn().mockResolvedValue({
      markdown,
      command: 'pi',
      cwd: '/repo',
      exitCode: 0,
      durationMs: 12,
      stdoutBytes: 100,
      stderrBytes: 0,
    });
    setReviewPrPiClient({ repoRoot: '/repo', review });
    const appendEvent = vi.fn();
    const ctx = {
      agentName: 'agent-reviewer',
      input: { id: 'evt-in', type: 'pr.received.v1', data },
      run: { id: 'run-1', attempt: 1 },
      emit: async (
        type: string,
        payload: unknown,
        options: { externalId: string },
      ) => {
        appendEvent(type, payload, options);
        return {
          id: 'evt-reviewed',
          type: 'pr.reviewed.v1',
          source: 'agent://agent-reviewer/handler',
          externalId: options.externalId,
          data: payload,
          rootId: 'evt-in',
          createdAt: new Date().toISOString(),
        };
      },
      requireDb: () => {
        throw new Error('not used');
      },
    };
    await reviewPrAgent(ctx, {
      id: 'evt-in',
      type: 'pr.received.v1',
      source: 'synapse://webhooks/gitlab',
      externalId: 'ext-in',
      data,
      subject: 'gitlab:synapse/synapse!42',
      rootId: 'evt-in',
      createdAt: new Date().toISOString(),
    });
    expect(review).toHaveBeenCalledWith(
      expect.objectContaining({
        repoRoot: '/repo',
        gitlab: {
          projectId: data.project.id,
          mergeRequestIid: data.merge_request.iid,
        },
        promptVersion: 'review-pr.v2',
      }),
    );
    expect(appendEvent).toHaveBeenCalledWith(
      'pr.reviewed.v1',
      expect.objectContaining({
        reviewer: expect.objectContaining({ agent: 'agent-reviewer' }),
      }),
      expect.objectContaining({
        externalId: reviewPrReviewedExternalId(data, 'evt-in'),
      }),
    );
  });

  it('propagates Pi failures without emitting', async () => {
    const data = fixtureReceivedData();
    setReviewPrPiClient({
      repoRoot: '/repo',
      review: vi
        .fn()
        .mockRejectedValue(new PiReviewFailedError('Pi failed', 2)),
    });
    const appendEvent = vi.fn();
    const ctx = {
      agentName: 'agent-reviewer',
      input: { id: 'evt-in', type: 'pr.received.v1', data },
      run: { id: 'run-1', attempt: 1 },
      emit: appendEvent,
      requireDb: () => {
        throw new Error('not used');
      },
    };
    await expect(
      reviewPrAgent(ctx, {
        id: 'evt-in',
        type: 'pr.received.v1',
        source: 'test',
        externalId: 'ext-in',
        data,
        rootId: 'evt-in',
        createdAt: new Date().toISOString(),
      }),
    ).rejects.toBeInstanceOf(PiReviewFailedError);
    expect(appendEvent).not.toHaveBeenCalled();
  });

  it('uses injected Pi client', () => {
    const client: PiReviewClient = {
      repoRoot: '/tmp',
      review: async () => ({
        markdown: '# ok',
        command: 'test',
        cwd: '/tmp',
        exitCode: 0,
        durationMs: 1,
        stdoutBytes: 0,
        stderrBytes: 0,
      }),
    };
    setReviewPrPiClient(client);
    expect(isAgentHandler(reviewPrAgent)).toBe(true);
  });
});
