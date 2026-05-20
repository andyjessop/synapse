import { z } from 'zod';

import { SCENARIO_RUN_ID_HEADER } from './headers.js';
import { AdapterInvokeError } from './invoke-adapter.js';
import type {
  AdapterErrorBody,
  AdapterInvokeInput,
  AdapterPort,
  InstallScenarioRunRequest,
  InstallScenarioRunResponse,
} from './types.js';

const adapterErrorBodySchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
      })
      .passthrough(),
  })
  .strict();

export type CreateAdapterHttpClientInput = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
};

export function createAdapterHttpClient(
  input: CreateAdapterHttpClientInput,
): AdapterPort {
  const fetchFn = input.fetchImpl ?? fetch;
  const base = input.baseUrl.replace(/\/$/, '');

  return {
    async invoke(invokeInput: AdapterInvokeInput): Promise<unknown> {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
      };
      if (invokeInput.scenarioRunId !== undefined) {
        headers[SCENARIO_RUN_ID_HEADER] = invokeInput.scenarioRunId;
      }

      const url = `${base}/v1/adapters/${encodeURIComponent(invokeInput.source)}/${encodeURIComponent(invokeInput.method)}`;
      const response = await fetchFn(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ params: invokeInput.params ?? {} }),
      });

      const text = await response.text();
      let json: unknown;
      try {
        json = text === '' ? {} : (JSON.parse(text) as unknown);
      } catch {
        throw new AdapterInvokeError(
          {
            code: 'adapter_body_invalid_json',
            message: `Adapter service returned non-JSON (${response.status})`,
            source: invokeInput.source,
            method: invokeInput.method,
            agentName: invokeInput.agentName,
          },
          { cause: text },
        );
      }

      if (!response.ok) {
        const parsed = adapterErrorBodySchema.safeParse(json);
        if (parsed.success) {
          throw new AdapterInvokeError(
            parsed.data.error as AdapterErrorBody['error'],
          );
        }
        throw new AdapterInvokeError({
          code: 'adapter_vendor_error',
          message: `Adapter invoke failed (${response.status})`,
          source: invokeInput.source,
          method: invokeInput.method,
          agentName: invokeInput.agentName,
        });
      }

      const success = z.object({ result: z.unknown() }).strict().parse(json);
      return success.result;
    },
  };
}

export async function installScenarioRun(
  baseUrl: string,
  body: InstallScenarioRunRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<InstallScenarioRunResponse> {
  const response = await fetchImpl(
    `${baseUrl.replace(/\/$/, '')}/v1/dev/scenario-runs`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Scenario run install failed (${response.status}): ${text}`,
    );
  }
  return z
    .object({
      scenarioRunId: z.string().min(1),
    })
    .strict()
    .parse(JSON.parse(text) as unknown);
}

export async function deleteScenarioRun(
  baseUrl: string,
  scenarioRunId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(
    `${baseUrl.replace(/\/$/, '')}/v1/dev/scenario-runs/${encodeURIComponent(scenarioRunId)}`,
    { method: 'DELETE' },
  );
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`Scenario run delete failed (${response.status}): ${text}`);
  }
}

export function parseAdaptersBaseUrl(
  env: Record<string, string | undefined>,
): string {
  const raw = env.ADAPTERS_BASE_URL?.trim();
  if (raw === undefined || raw === '') {
    return 'http://127.0.0.1:3104';
  }
  return raw;
}
