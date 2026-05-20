import type { Context } from 'hono';
import {
  type AdapterErrorBody,
  assertJsonSerializable,
  formatZodParamsError,
  type ResolvedScenarioAdapterFixture,
} from 'runtime-adapters';
import {
  loadMountedAdapterSources,
  type RuntimeManifest,
} from 'runtime-manifest';
import { z } from 'zod';
import {
  deleteScenarioRun,
  installScenarioRun,
} from '../scenario/scenario-run-store.js';
import {
  adapterMethodRegistry,
  adapterSourceMethods,
  isKnownAdapterSource,
} from '../shipped-adapter-runtime.js';

const installBodySchema = z
  .object({
    scenarioId: z.string().min(1),
    adapters: z.array(
      z
        .object({
          source: z.string().min(1),
          method: z.string().min(1),
          params: z.record(z.string(), z.unknown()).optional(),
          returns: z.unknown(),
        })
        .strict(),
    ),
  })
  .strict();

export type DevScenarioRunsDeps = {
  manifest: RuntimeManifest;
};

function jsonError(
  c: Context,
  status: 400 | 404 | 409 | 413 | 422 | 500 | 502,
  error: AdapterErrorBody['error'],
): Response {
  return c.json({ error }, status);
}

function normalizeParams(
  params: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return params ?? {};
}

export function mountDevScenarioRunRoutes(
  app: {
    post: (
      path: string,
      handler: (c: Context) => Promise<Response> | Response,
    ) => void;
    delete: (
      path: string,
      handler: (c: Context) => Promise<Response> | Response,
    ) => void;
  },
  deps: DevScenarioRunsDeps,
): void {
  app.post('/v1/dev/scenario-runs', async (c) => {
    let bodyJson: unknown;
    try {
      bodyJson = await c.req.json();
    } catch {
      return jsonError(c, 400, {
        code: 'adapter_body_invalid_json',
        message: 'Request body is not valid JSON',
      });
    }

    const bodyParsed = installBodySchema.safeParse(bodyJson);
    if (!bodyParsed.success) {
      return jsonError(c, 400, {
        code: 'adapter_request_invalid',
        message: 'Invalid scenario run install body',
        fieldPath: 'body',
      });
    }

    const mounted = loadMountedAdapterSources(deps.manifest);
    const resolved: ResolvedScenarioAdapterFixture[] = [];

    for (let index = 0; index < bodyParsed.data.adapters.length; index += 1) {
      const entry = bodyParsed.data.adapters[index]!;
      const { source, method } = entry;

      if (!isKnownAdapterSource(source)) {
        return jsonError(c, 400, {
          code: 'adapter_source_unknown',
          message: `Unknown adapter source ${source} at fixture index ${index}`,
          source,
          method,
        });
      }

      if (!mounted.has(source)) {
        return jsonError(c, 400, {
          code: 'adapter_source_not_mounted',
          message: `Adapter source ${source} is not mounted (fixture index ${index})`,
          source,
          method,
        });
      }

      const catalogMethods = adapterSourceMethods(source);
      if (!catalogMethods.includes(method as (typeof catalogMethods)[number])) {
        return jsonError(c, 400, {
          code: 'adapter_method_unknown',
          message: `Unknown method ${method} for ${source} (fixture index ${index})`,
          source,
          method,
        });
      }

      const methodDef = adapterMethodRegistry.get(source, method);
      if (methodDef === undefined) {
        return jsonError(c, 400, {
          code: 'adapter_method_unknown',
          message: `Method ${method} not registered (fixture index ${index})`,
          source,
          method,
        });
      }

      const params = normalizeParams(entry.params);
      try {
        assertJsonSerializable(params, 'params');
      } catch (error) {
        const fieldPath =
          error instanceof Error && 'fieldPath' in error
            ? String((error as { fieldPath: string }).fieldPath)
            : `adapters[${index}].params`;
        const valueKind =
          error instanceof Error && 'valueKind' in error
            ? String((error as { valueKind: string }).valueKind)
            : 'unknown';
        return jsonError(c, 400, {
          code: 'adapter_params_not_serializable',
          message: `Scenario fixture params not JSON-serializable at index ${index}`,
          source,
          method,
          fieldPath,
          valueKind,
        });
      }

      const paramsParsed = methodDef.paramsSchema.safeParse(params);
      if (!paramsParsed.success) {
        return jsonError(
          c,
          400,
          formatZodParamsError(
            { source, method, agentName: 'dev:once' },
            paramsParsed.error.issues,
          ),
        );
      }

      try {
        assertJsonSerializable(entry.returns, 'returns');
      } catch (error) {
        const valueKind =
          error instanceof Error && 'valueKind' in error
            ? String((error as { valueKind: string }).valueKind)
            : 'unknown';
        return jsonError(c, 400, {
          code: 'adapter_fixture_result_invalid',
          message: `Scenario fixture returns not JSON-serializable at index ${index}`,
          source,
          method,
          fieldPath: `adapters[${index}].returns`,
          valueKind,
        });
      }

      const returnsParsed = methodDef.resultSchema.safeParse(entry.returns);
      if (!returnsParsed.success) {
        return jsonError(c, 422, {
          code: 'adapter_fixture_result_invalid',
          message: `Scenario fixture returns invalid at index ${index}`,
          source,
          method,
          fieldPath: `adapters[${index}].returns`,
        });
      }

      resolved.push({
        source,
        method,
        params,
        returns: returnsParsed.data,
      });
    }

    const scenarioRunId = installScenarioRun({
      scenarioId: bodyParsed.data.scenarioId,
      adapters: resolved,
    });

    return c.json({ scenarioRunId });
  });

  app.delete('/v1/dev/scenario-runs/:scenarioRunId', (c) => {
    const scenarioRunId = c.req.param('scenarioRunId');
    if (scenarioRunId === undefined || scenarioRunId === '') {
      return jsonError(c, 400, {
        code: 'adapter_request_invalid',
        message: 'Missing scenarioRunId',
      });
    }
    deleteScenarioRun(scenarioRunId);
    return c.body(null, 204);
  });
}
