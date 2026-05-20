import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { triggerTicketOpened } from 'example-agent-notifier';
import type { RuntimePool } from 'runtime-store';

import { scheduleIngressRunSnapshot } from '../ingress-run-snapshot.js';
import { resolveIngressRunSnapshotScenarioId } from '../scenario/scenario-request-context.js';

const ticketOpenedBodySchema = z
  .object({
    ticket_id: z.string().min(1),
    title: z.string().min(1),
    body: z.string(),
  })
  .strict();

export const exampleNotifierTicketAcceptedResponseSchema = z
  .object({
    event_id: z.string().min(1),
    type: z.literal('ticket.opened.v1'),
    external_id: z.string().min(1),
    subject: z.string().optional(),
  })
  .strict();

const exampleNotifierTicketRoute = createRoute({
  method: 'post',
  path: '/v1/examples/notifier/ticket',
  operationId: 'exampleNotifierTicket',
  request: {
    body: {
      content: {
        'application/json': {
          schema: ticketOpenedBodySchema,
        },
      },
    },
  },
  responses: {
    202: {
      content: {
        'application/json': {
          schema: exampleNotifierTicketAcceptedResponseSchema,
        },
      },
      description: 'Example notifier ticket accepted',
    },
    400: { description: 'Invalid request body' },
    415: { description: 'Unsupported media type' },
    500: { description: 'Runtime store failure' },
  },
});

export type RegisterExampleNotifierRoutesInput = {
  pool: RuntimePool;
  repoRoot: string;
  redisUrl?: string;
};

export function registerExampleNotifierRoutes(
  app: OpenAPIHono,
  input: RegisterExampleNotifierRoutesInput,
): void {
  app.openapi(exampleNotifierTicketRoute, async (c) => {
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

    const parsed = ticketOpenedBodySchema.safeParse(body);
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
      const event = await triggerTicketOpened({
        pool: input.pool,
        repoRoot: input.repoRoot,
        ticket: parsed.data,
      });
      scheduleIngressRunSnapshot({
        pool: input.pool,
        repoRoot: input.repoRoot,
        redisUrl: input.redisUrl,
        inputEventId: event.id,
        scenarioId: resolveIngressRunSnapshotScenarioId(
          'ingress:POST /v1/examples/notifier/ticket',
        ),
        terminalEventTypes: ['ticket.notified.v1'],
      });
      return c.json(
        {
          event_id: event.id,
          type: 'ticket.opened.v1' as const,
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
            message: 'Failed to persist ticket.opened event',
          },
        },
        500,
      );
    }
  });
}
