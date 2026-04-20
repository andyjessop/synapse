import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getRepoRoot } from 'runtime-config';
import type { SynapseEvent } from 'runtime-events';
import { describe, expect, it } from 'vitest';
import { gitlabMergeRequestWebhookSchema } from '../../src/gitlab-webhook';
import { normalizeGitLabMergeRequestWebhook } from '../../src/ingress';
import {
  buildReviewPrPrompt,
  countReviewFindings,
  extractReviewSummary,
} from '../../src/prompt';
import { readPiReviewMarkdownFixture } from '../fixture-data.js';

const fixtureDir = join(
  getRepoRoot(import.meta.url),
  'fixtures/agent-reviewer',
);

function fixtureEvent(): SynapseEvent<'pr.received.v1'> {
  const raw = readFileSync(
    join(fixtureDir, 'gitlab-merge-request.json'),
    'utf8',
  );
  const payload = gitlabMergeRequestWebhookSchema.parse(JSON.parse(raw));
  return {
    specversion: '1.0',
    id: 'evt-pr',
    type: 'pr.received.v1',
    source: 'synapse://webhooks/gitlab/prs',
    subject: 'gitlab:synapse/synapse!42',
    time: '2026-05-17T10:06:00.000Z',
    datacontenttype: 'application/json',
    data: normalizeGitLabMergeRequestWebhook(payload),
  };
}

describe('review prompt helpers', () => {
  it('builds a prompt with required metadata', () => {
    const prompt = buildReviewPrPrompt({
      event: fixtureEvent(),
      repoRoot: '/workspace/synapse',
    });
    expect(prompt).toContain('/workspace/synapse');
    expect(prompt).toContain('synapse/synapse');
    expect(prompt).toContain('feature/reviewer-live-pi');
    expect(prompt).toContain('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    expect(prompt).toContain('## Summary');
    expect(prompt).toContain('fetch_merge_request_diff');
    expect(prompt).toContain('project_id=');
    expect(prompt).toContain('merge_request_iid=');
    expect(prompt).not.toContain('object_kind');
  });

  it('extracts summary and finding counts', () => {
    const markdown = readPiReviewMarkdownFixture(fixtureDir);
    expect(extractReviewSummary(markdown)).toContain('coherent');
    expect(countReviewFindings(markdown)).toBe(0);
    expect(
      countReviewFindings('## Findings\n- Bug in auth\n- Missing test\n'),
    ).toBe(2);
  });
});
