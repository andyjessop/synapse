import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getRepoRoot } from 'runtime-config';
import { describe, expect, it } from 'vitest';
import { gitlabMergeRequestWebhookSchema } from '../../src/gitlab-webhook';

const fixtureDir = join(
  getRepoRoot(import.meta.url),
  'fixtures/agent-reviewer',
);

describe('gitlabMergeRequestWebhookSchema', () => {
  it('parses the review PR webhook payload fixture', () => {
    const raw = readFileSync(
      join(fixtureDir, 'gitlab-merge-request.json'),
      'utf8',
    );
    const payload = gitlabMergeRequestWebhookSchema.parse(JSON.parse(raw));
    expect(payload.object_kind).toBe('merge_request');
    expect(payload.project.path_with_namespace).toBe('synapse/synapse');
    expect(payload.object_attributes.action).toBe('open');
    expect(payload.object_attributes.iid).toBe(42);
    expect(payload.object_attributes.last_commit.id).toHaveLength(40);
  });
});
