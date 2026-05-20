import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  pollSourceIdSchema,
  pollTickRequestSchema,
  type ResolvedPollSource,
} from 'runtime-manifest';
import type { ObservabilityHandle } from 'runtime-observability';
import type { RuntimePool } from 'runtime-store';
import { isScenarioDevContextEnabled } from '../scenario/mount-scenario-dev-routes.js';
import {
  pollRunErrorResponseSchema,
  pollRunResponseSchema,
} from './poll-http-schemas.js';
import { runPollSource } from './run-poll-source.js';

export type MountPollRoutesInput = {
  pool: RuntimePool;
  repoRoot: string;
  redisUrl: string;
  observability?: ObservabilityHandle;
  env: NodeJS.ProcessEnv;
  resolvedSources: ResolvedPollSource[];
};

function findEnabledSource(
  sources: ResolvedPollSource[],
  sourceId: z.infer<typeof pollSourceIdSchema>,
): ResolvedPollSource | undefined {
  const match = sources.find((s) => s.id === sourceId);
  if (match === undefined || !match.enabled) {
    return undefined;
  }
  return match;
}

export function mountPollRoutes(
  app: OpenAPIHono,
  input: MountPollRoutesInput,
): void {
  const resolved = input.resolvedSources;

  const pollTickRoute = createRoute({
    method: 'post',
    path: '/v1/poll/{sourceId}/tick',
    operationId: 'pollSourceTick',
    request: {
      params: z.object({ sourceId: pollSourceIdSchema }),
      body: {
        content: {
          'application/json': {
            schema: pollTickRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          'application/json': { schema: pollRunResponseSchema },
        },
        description: 'Poll tick completed',
      },
      400: {
        content: {
          'application/json': { schema: pollRunErrorResponseSchema },
        },
        description: 'Scenario context not allowed',
      },
      404: {
        content: {
          'application/json': { schema: pollRunErrorResponseSchema },
        },
        description: 'Poll source not mounted or disabled',
      },
      500: {
        content: {
          'application/json': { schema: pollRunErrorResponseSchema },
        },
        description: 'Poll tick failed',
      },
    },
  });

  app.openapi(pollTickRoute, async (c) => {
    const sourceId = c.req.valid('param').sourceId;
    const source = findEnabledSource(resolved, sourceId);
    if (source === undefined) {
      return c.json(
        { error: { code: 'not_found', message: 'Poll source not available' } },
        404,
      );
    }

    const tickBody = c.req.valid('json');
    if (
      tickBody.scenarioFixtureContext !== undefined &&
      !isScenarioDevContextEnabled(input.env)
    ) {
      return c.json(
        {
          error: {
            code: 'scenario_context_disabled',
            message:
              'scenarioFixtureContext is only available in dev scenario mode',
          },
        },
        400,
      );
    }

    const outcome = await runPollSource({
      resolved: source,
      invocation: 'manual-http',
      pool: input.pool,
      repoRoot: input.repoRoot,
      redisUrl: input.redisUrl,
      observability: input.observability,
      env: input.env,
      scenarioFixtureContext: tickBody.scenarioFixtureContext,
    });

    if (!outcome.ok) {
      return c.json({ error: outcome.error }, 500);
    }
    return c.json({ summary: outcome.summary }, 200);
  });
}
