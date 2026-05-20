import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
  installScenarioContextRequestSchema,
  installScenarioContextResponseSchema,
} from 'runtime-manifest';

import { installScenarioContext } from './scenario-context-store.js';

export function isScenarioDevContextEnabled(env: NodeJS.ProcessEnv): boolean {
  const explicit = env.SYNAPSE_DEV_SCENARIO_CONTEXT?.trim().toLowerCase();
  return explicit === '1' || explicit === 'true' || explicit === 'yes';
}

export function mountScenarioDevRoutes(
  app: OpenAPIHono,
  env: NodeJS.ProcessEnv,
): void {
  if (!isScenarioDevContextEnabled(env)) {
    return;
  }

  const installRoute = createRoute({
    method: 'post',
    path: '/v1/dev/scenario-context',
    operationId: 'installScenarioContext',
    request: {
      body: {
        content: {
          'application/json': {
            schema: installScenarioContextRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          'application/json': {
            schema: installScenarioContextResponseSchema,
          },
        },
        description: 'Scenario context installed',
      },
      400: {
        description: 'Invalid request',
      },
    },
  });

  app.openapi(installRoute, async (c) => {
    const body = c.req.valid('json');
    const contextId = installScenarioContext(body.scenarioFixtureContext);
    return c.json({ contextId }, 200);
  });
}
