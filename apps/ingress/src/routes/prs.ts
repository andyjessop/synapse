import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  emitReviewPrReceived,
  gitlabMergeRequestWebhookSchema,
  REVIEW_PR_INGRESS_SOURCE,
  reviewerIngressAgent,
} from 'agent-reviewer';
import type { ObservabilityHandle } from 'runtime-observability';
import type { RuntimePool } from 'runtime-store';
import { createIngressContext } from 'runtime-worker';

import { scheduleIngressRunSnapshot } from '../ingress-run-snapshot.js';
import { resolveIngressRunSnapshotScenarioId } from '../scenario/scenario-request-context.js';

export const prWebhookAcceptedResponseSchema = z
  .object({
    event_id: z.string().min(1),
    type: z.literal('pr.received.v1'),
    external_id: z.string().min(1),
    subject: z.string().min(1),
  })
  .strict();

const GITLAB_MERGE_REQUEST_HOOK = 'Merge Request Hook';

const prsRoute = createRoute({
  method: 'post',
  path: '/v1/prs',
  operationId: 'prs',
  request: {
    headers: z.object({
      'x-gitlab-event': z.string().optional(),
    }),
    body: {
      content: {
        'application/json': {
          schema: gitlabMergeRequestWebhookSchema,
        },
      },
    },
  },
  responses: {
    202: {
      content: {
        'application/json': {
          schema: prWebhookAcceptedResponseSchema,
        },
      },
      description: 'Merge request webhook accepted',
    },
    400: { description: 'Invalid request body' },
    415: { description: 'Unsupported media type' },
    422: { description: 'Invalid GitLab event header' },
    500: { description: 'Runtime store failure' },
  },
});

export type RegisterPrRoutesInput = {
  pool: RuntimePool;
  repoRoot: string;
  redisUrl?: string;
  observability?: ObservabilityHandle;
};

export function registerPrRoutes(
  app: OpenAPIHono,
  input: RegisterPrRoutesInput,
): void {
  app.openapi(prsRoute, async (c) => {
    const contentType = c.req.header('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return c.json(
        {
          error: {
            code: 'unsupported_media_type',
            message: 'Expected application/json request body',
          },
        },
        415,
      );
    }

    const gitlabEvent = c.req.header('x-gitlab-event');
    if (gitlabEvent !== GITLAB_MERGE_REQUEST_HOOK) {
      return c.json(
        {
          error: {
            code: 'invalid_gitlab_event',
            message: `Expected X-Gitlab-Event: ${GITLAB_MERGE_REQUEST_HOOK}`,
          },
        },
        422,
      );
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        {
          error: {
            code: 'invalid_request',
            message: 'Invalid JSON body',
          },
        },
        400,
      );
    }

    const parsed = gitlabMergeRequestWebhookSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: {
            code: 'invalid_request',
            message: 'Invalid request',
            details: { issues: parsed.error.issues },
          },
        },
        400,
      );
    }

    if (
      parsed.data.object_kind !== 'merge_request' ||
      parsed.data.event_type !== 'merge_request'
    ) {
      return c.json(
        {
          error: {
            code: 'invalid_request',
            message: 'Expected merge request webhook payload',
          },
        },
        400,
      );
    }

    try {
      const ctx = createIngressContext({
        agent: reviewerIngressAgent,
        source: REVIEW_PR_INGRESS_SOURCE,
        store: input.pool,
        tracer: input.observability?.tracer,
      });
      const event = await emitReviewPrReceived(ctx, {
        payload: parsed.data,
        receivedAt: new Date().toISOString(),
      });
      if (event.externalId === undefined || event.subject === undefined) {
        throw new Error('Emitted pr.received.v1 missing required metadata');
      }
      scheduleIngressRunSnapshot({
        pool: input.pool,
        repoRoot: input.repoRoot,
        redisUrl: input.redisUrl,
        inputEventId: event.id,
        scenarioId: resolveIngressRunSnapshotScenarioId('ingress:POST /v1/prs'),
        terminalEventTypes: ['pr.reviewed.v1'],
      });
      return c.json(
        {
          event_id: event.id,
          type: 'pr.received.v1' as const,
          external_id: event.externalId,
          subject: event.subject,
        },
        202,
      );
    } catch {
      return c.json(
        {
          error: {
            code: 'internal_error',
            message: 'Failed to persist webhook event',
          },
        },
        500,
      );
    }
  });
}
