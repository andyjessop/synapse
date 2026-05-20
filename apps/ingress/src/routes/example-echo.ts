import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { triggerEchoPing } from 'example-agent-echo';
import type { RuntimePool } from 'runtime-store';

import { scheduleIngressRunSnapshot } from '../ingress-run-snapshot.js';
import { resolveIngressRunSnapshotScenarioId } from '../scenario/scenario-request-context.js';

const pingBodySchema = z
  .object({
    message: z.string().min(1).optional(),
  })
  .strict();

export const exampleEchoPingAcceptedResponseSchema = z
  .object({
    event_id: z.string().min(1),
    type: z.literal('example.ping.v1'),
    external_id: z.string().min(1),
    subject: z.string().optional(),
  })
  .strict();

const exampleEchoPingRoute = createRoute({
  method: 'post',
  path: '/v1/examples/echo/ping',
  operationId: 'exampleEchoPing',
  request: {
    body: {
      content: {
        'application/json': {
          schema: pingBodySchema,
        },
      },
    },
  },
  responses: {
    202: {
      content: {
        'application/json': {
          schema: exampleEchoPingAcceptedResponseSchema,
        },
      },
      description: 'Example echo ping accepted',
    },
    400: { description: 'Invalid request body' },
    415: { description: 'Unsupported media type' },
    500: { description: 'Runtime store failure' },
  },
});

export type RegisterExampleEchoRoutesInput = {
  pool: RuntimePool;
  repoRoot: string;
  redisUrl?: string;
};

export function registerExampleEchoRoutes(
  app: OpenAPIHono,
  input: RegisterExampleEchoRoutesInput,
): void {
  app.openapi(exampleEchoPingRoute, async (c) => {
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

    const parsed = pingBodySchema.safeParse(body);
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

    try {
      const event = await triggerEchoPing({
        pool: input.pool,
        repoRoot: input.repoRoot,
        body: parsed.data,
      });
      scheduleIngressRunSnapshot({
        pool: input.pool,
        repoRoot: input.repoRoot,
        redisUrl: input.redisUrl,
        inputEventId: event.id,
        scenarioId: resolveIngressRunSnapshotScenarioId(
          'ingress:POST /v1/examples/echo/ping',
        ),
        terminalEventTypes: ['example.pong.v1'],
      });
      return c.json(
        {
          event_id: event.id,
          type: 'example.ping.v1' as const,
          external_id: event.externalId,
          ...(event.subject !== undefined ? { subject: event.subject } : {}),
        },
        202,
      );
    } catch {
      return c.json(
        {
          error: {
            code: 'internal_error',
            message: 'Failed to persist example.ping event',
          },
        },
        500,
      );
    }
  });
}
