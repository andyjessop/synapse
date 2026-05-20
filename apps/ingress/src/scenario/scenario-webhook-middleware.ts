import type { MiddlewareHandler } from 'hono';

import {
  resolveWebhookScenarioContextFromHeader,
  runWithScenarioFixtureContext,
  scenarioContextIdFromHeaders,
} from './scenario-request-context.js';

export function createScenarioWebhookMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const contextId = scenarioContextIdFromHeaders(c.req.raw.headers);
    if (contextId === undefined) {
      return next();
    }
    try {
      const context = resolveWebhookScenarioContextFromHeader(contextId);
      return runWithScenarioFixtureContext(context, () => next());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json(
        {
          error: {
            code: 'invalid_scenario_context',
            message,
          },
        },
        400,
      );
    }
  };
}
