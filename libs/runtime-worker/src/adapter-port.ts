import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  type AdapterPort,
  createAdapterHttpClient,
  parseAdaptersBaseUrl,
} from 'runtime-adapters';
import { z } from 'zod';

const activeScenarioRunSchema = z
  .object({
    scenarioRunId: z.string().min(1),
    scenarioId: z.string().min(1),
    startedAt: z.string().min(1),
  })
  .strict();

function isDevScenarioContextEnabled(
  env: Record<string, string | undefined>,
): boolean {
  const raw = env.SYNAPSE_DEV_SCENARIO_CONTEXT?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function readScenarioRunIdFromBinding(repoRoot: string): string | undefined {
  const path = join(repoRoot, 'tmp/dev/active-scenario-run.json');
  if (!existsSync(path)) {
    return undefined;
  }
  const parsed = activeScenarioRunSchema.parse(
    JSON.parse(readFileSync(path, 'utf8')) as unknown,
  );
  return parsed.scenarioRunId;
}

export function createWorkerAdapterPort(input: {
  env: Record<string, string | undefined>;
  repoRoot: string;
}): AdapterPort {
  const baseUrl = parseAdaptersBaseUrl(input.env);
  const inner = createAdapterHttpClient({ baseUrl });
  const scenarioRunId =
    isDevScenarioContextEnabled(input.env) &&
    readScenarioRunIdFromBinding(input.repoRoot);

  return {
    invoke(invokeInput) {
      return inner.invoke({
        ...invokeInput,
        ...(scenarioRunId ? { scenarioRunId } : {}),
      });
    },
  };
}
