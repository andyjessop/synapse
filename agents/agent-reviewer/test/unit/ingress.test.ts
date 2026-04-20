import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getRepoRoot } from 'runtime-config';
import { describe, expect, it, vi } from 'vitest';
import { gitlabMergeRequestWebhookSchema } from '../../src/gitlab-webhook';
import {
  emitReviewPrReceived,
  normalizeGitLabMergeRequestWebhook,
  REVIEW_PR_INGRESS_SOURCE,
  reviewPrExternalId,
  reviewPrSubject,
} from '../../src/ingress';

const fixtureDir = join(
  getRepoRoot(import.meta.url),
  'fixtures/agent-reviewer',
);

describe('review ingress', () => {
  it('normalizes fixture fields for pr.received.v1', () => {
    const raw = readFileSync(
      join(fixtureDir, 'gitlab-merge-request.json'),
      'utf8',
    );
    const payload = gitlabMergeRequestWebhookSchema.parse(JSON.parse(raw));
    const normalized = normalizeGitLabMergeRequestWebhook(payload);
    expect(normalized.provider).toBe('gitlab');
    expect(normalized.project.path_with_namespace).toBe('synapse/synapse');
    expect(normalized.merge_request.iid).toBe(42);
    expect(normalized.merge_request.last_commit_sha).toHaveLength(40);
    expect(normalized.labels).toEqual(['review']);
    expect(reviewPrSubject(payload)).toBe('gitlab:synapse/synapse!42');
    expect(reviewPrExternalId(payload)).toBe(
      'gitlab:merge-request:202:9101:open:2026-05-17T10:05:00.000Z',
    );
  });

  it('emits pr.received.v1 with ingress metadata', async () => {
    const raw = readFileSync(
      join(fixtureDir, 'gitlab-merge-request.json'),
      'utf8',
    );
    const payload = gitlabMergeRequestWebhookSchema.parse(JSON.parse(raw));
    const emit = vi.fn().mockResolvedValue({ id: 'evt-1' });
    await emitReviewPrReceived(
      {
        emit,
        agent: 'agent-reviewer',
        source: REVIEW_PR_INGRESS_SOURCE,
        store: { pool: {} as never },
        adapters: {},
        agents: {},
      },
      { payload, receivedAt: '2026-05-17T10:06:00.000Z' },
    );
    expect(emit).toHaveBeenCalledWith(
      'pr.received.v1',
      expect.objectContaining({
        provider: 'gitlab',
        project: expect.objectContaining({
          path_with_namespace: 'synapse/synapse',
        }),
      }),
      {
        source: REVIEW_PR_INGRESS_SOURCE,
        subject: 'gitlab:synapse/synapse!42',
        externalId:
          'gitlab:merge-request:202:9101:open:2026-05-17T10:05:00.000Z',
      },
    );
  });
});
