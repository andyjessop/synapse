import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';

const healthResponseSchema = z
  .object({
    ok: z.literal(true),
    service: z.literal('ingress'),
    time: z.string().min(1),
  })
  .strict();

const healthRoute = createRoute({
  method: 'get',
  path: '/healthz',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: healthResponseSchema,
        },
      },
      description: 'Webhooks health',
    },
  },
});

export function registerHealthRoutes(app: OpenAPIHono): void {
  app.openapi(healthRoute, (c) =>
    c.json({
      ok: true as const,
      service: 'ingress' as const,
      time: new Date().toISOString(),
    }),
  );
}
