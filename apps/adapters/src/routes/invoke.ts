import type { Context } from 'hono';
import {
  assertJsonSerializable,
  formatZodParamsError,
  type RegisterableAdapterMethod,
  scenarioRunIdFromHeaders,
} from 'runtime-adapters';
import type { RuntimeManifest } from 'runtime-manifest';
import type { ObservabilityHandle } from 'runtime-observability';

import {
  InvokeRouteError,
  jsonAdapterError,
} from '../invoke/adapter-http-errors.js';
import {
  executeAdapterInvoke,
  ScenarioAdapterQueueError,
} from '../invoke/execute-adapter-invoke.js';
import { parseAdapterInvokeRequest } from '../invoke/parse-adapter-request.js';
import { resolveAdapterMethod } from '../invoke/resolve-adapter-method.js';
import { runAdapterRequestSpan } from '../observability.js';
import type { AdapterLiveDeps } from '../shipped-adapter-runtime.js';

export type InvokeRouteDeps = {
  manifest: RuntimeManifest;
  liveDeps: AdapterLiveDeps;
  observability: ObservabilityHandle;
  maxBodyBytes: number;
};

export function mountInvokeRoutes(
  app: {
    post: (
      path: string,
      handler: (c: Context) => Promise<Response> | Response,
    ) => void;
  },
  deps: InvokeRouteDeps,
): void {
  app.post('/v1/adapters/:source/:method', async (c) => {
    const sourceParam = c.req.param('source');
    const methodParam = c.req.param('method');
    if (sourceParam === undefined || methodParam === undefined) {
      return jsonAdapterError(c, 400, {
        code: 'adapter_request_invalid',
        message: 'Missing adapter source or method path segment',
      });
    }
    const source = sourceParam;
    const method = methodParam;
    const scenarioRunId = scenarioRunIdFromHeaders(c.req.raw.headers);

    const parsedRequest = await parseAdapterInvokeRequest({
      rawBody: await c.req.text(),
      maxBodyBytes: deps.maxBodyBytes,
      source,
      method,
    });
    if (!parsedRequest.ok) {
      return jsonAdapterError(
        c,
        parsedRequest.failure.status,
        parsedRequest.failure.error,
      );
    }

    const resolved = resolveAdapterMethod({
      manifest: deps.manifest,
      source,
      method,
    });
    if (!resolved.ok) {
      return jsonAdapterError(
        c,
        resolved.failure.status,
        resolved.failure.error,
      );
    }

    const methodDef = resolved.value.methodDef;
    const paramsParsed = methodDef.paramsSchema.safeParse(
      parsedRequest.value.params,
    );
    if (!paramsParsed.success) {
      return jsonAdapterError(
        c,
        400,
        formatZodParamsError(
          {
            source: methodDef.source,
            method: methodDef.method,
            agentName: 'unknown',
          },
          paramsParsed.error.issues,
        ),
      );
    }

    const mode = scenarioRunId !== undefined ? 'scenario' : 'live';

    try {
      const result = await runAdapterRequestSpan({
        observability: deps.observability,
        source,
        method,
        mode,
        scenarioRunId,
        run: () =>
          executeAdapterInvoke({
            methodDef,
            source,
            method,
            params: paramsParsed.data,
            scenarioRunId,
            liveDeps: deps.liveDeps,
          }),
      });

      return jsonAdapterSuccess(c, {
        methodDef,
        source,
        method,
        mode,
        scenarioRunId,
        result,
      });
    } catch (error) {
      return mapInvokeError(c, error, { source, method, scenarioRunId });
    }
  });
}

function jsonAdapterSuccess(
  c: Context,
  input: {
    methodDef: RegisterableAdapterMethod;
    source: string;
    method: string;
    mode: 'live' | 'scenario';
    scenarioRunId?: string;
    result: unknown;
  },
): Response {
  const resultParsed = input.methodDef.resultSchema.safeParse(input.result);
  if (!resultParsed.success) {
    const code =
      input.mode === 'scenario'
        ? 'adapter_fixture_result_invalid'
        : 'adapter_result_invalid';
    return jsonAdapterError(c, input.mode === 'scenario' ? 422 : 500, {
      code,
      message: `Invalid result for ${input.source}.${input.method}`,
      source: input.source,
      method: input.method,
      scenarioRunId: input.scenarioRunId,
    });
  }

  try {
    assertJsonSerializable(resultParsed.data, 'result');
  } catch (error) {
    const valueKind =
      error instanceof Error && 'valueKind' in error
        ? String((error as { valueKind: string }).valueKind)
        : 'unknown';
    const code =
      input.mode === 'scenario'
        ? 'adapter_fixture_result_invalid'
        : 'adapter_result_invalid';
    return jsonAdapterError(c, input.mode === 'scenario' ? 422 : 500, {
      code,
      message: `Adapter result for ${input.source}.${input.method} is not JSON-serializable`,
      source: input.source,
      method: input.method,
      fieldPath: 'result',
      valueKind,
      scenarioRunId: input.scenarioRunId,
    });
  }

  return c.json({ result: resultParsed.data });
}

function mapInvokeError(
  c: Context,
  error: unknown,
  ctx: { source: string; method: string; scenarioRunId?: string },
): Response {
  if (error instanceof InvokeRouteError) {
    return jsonAdapterError(c, error.status, error.body);
  }
  if (error instanceof ScenarioAdapterQueueError) {
    const status =
      error.code === 'adapter_fixture_exhausted' ||
      error.code === 'adapter_fixture_not_found'
        ? 409
        : 500;
    return jsonAdapterError(c, status, {
      code: error.code,
      message: error.message,
      source: ctx.source,
      method: ctx.method,
      scenarioRunId: ctx.scenarioRunId,
    });
  }
  return jsonAdapterError(c, 502, {
    code: 'adapter_vendor_error',
    message: error instanceof Error ? error.message : 'Adapter vendor error',
    source: ctx.source,
    method: ctx.method,
  });
}
