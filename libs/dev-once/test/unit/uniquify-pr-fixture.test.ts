import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  gitlabMergeRequestWebhookSchema,
  reviewPrExternalId,
} from 'agent-reviewer';
import { describe, expect, it } from 'vitest';

import { uniquifyGitLabMergeRequestWebhookBody } from '../../src/uniquify-pr-fixture.js';

const repoRoot = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../..',
);
const payloadPath = join(
  repoRoot,
  'fixtures/agent-reviewer/gitlab-merge-request.json',
);

describe('uniquifyGitLabMergeRequestWebhookBody', () => {
  it('changes ingress externalId on each call', () => {
    const body = readFileSync(payloadPath);
    const first = gitlabMergeRequestWebhookSchema.parse(
      JSON.parse(uniquifyGitLabMergeRequestWebhookBody(body).toString('utf8')),
    );
    const second = gitlabMergeRequestWebhookSchema.parse(
      JSON.parse(uniquifyGitLabMergeRequestWebhookBody(body).toString('utf8')),
    );
    expect(reviewPrExternalId(first)).not.toBe(reviewPrExternalId(second));
  });
});
