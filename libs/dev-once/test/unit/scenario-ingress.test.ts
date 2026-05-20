import { SCENARIO_RUN_ID_HEADER } from 'runtime-adapters';
import { getRepoRoot } from 'runtime-config';
import { WEBHOOK_ROUTE_CATALOG } from 'runtime-manifest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postWebhookBody } = vi.hoisted(() => ({
  postWebhookBody: vi.fn(),
}));

vi.mock('../../src/webhook-post.js', () => ({
  postWebhookBody,
  parseAcceptedWebhookJson: () => ({
    ok: true as const,
    event_id: 'evt_test',
  }),
}));

import { runScenarioWebhookStep } from '../../src/scenario-ingress.js';

describe('runScenarioWebhookStep', () => {
  beforeEach(() => {
    postWebhookBody.mockReset();
    postWebhookBody.mockResolvedValue({
      ok: true,
      status: 202,
      json: {
        event_id: 'evt_test',
        type: 'pr.received.v1',
        external_id: 'ext',
        subject: 'sub',
      },
    });
  });

  it('merges webhook catalog defaultHeaders for GitLab prs route', async () => {
    const source = 'synapse.webhooks.prs.v1';
    const route = WEBHOOK_ROUTE_CATALOG[source];

    const repoRoot = getRepoRoot(import.meta.url);

    await runScenarioWebhookStep({
      repoRoot,
      ingressBase: 'http://127.0.0.1:3102',
      scenario: {
        id: 'review-pr/gitlab-synapse',
        ingress: {
          source,
          fixtures: [
            { file: 'fixtures/agent-reviewer/gitlab-merge-request.json' },
          ],
        },
      },
      resolved: { kind: 'webhook', source },
      fixture: { file: 'fixtures/agent-reviewer/gitlab-merge-request.json' },
      scenarioRunId: 'run-abc',
    });

    expect(postWebhookBody).toHaveBeenCalledOnce();
    const call = postWebhookBody.mock.calls[0]?.[0] as {
      headers?: Record<string, string>;
      path: string;
    };
    expect(call.path).toBe(route.path);
    expect(call.headers).toEqual({
      'X-Gitlab-Event': 'Merge Request Hook',
      [SCENARIO_RUN_ID_HEADER]: 'run-abc',
    });
  });
});
