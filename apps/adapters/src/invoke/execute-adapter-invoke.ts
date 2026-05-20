import {
  type RegisterableAdapterMethod,
  ScenarioAdapterQueueError,
} from 'runtime-adapters';
import {
  getScenarioRun,
  type ScenarioRunRecord,
} from '../scenario/scenario-run-store.js';
import type { AdapterLiveDeps } from '../shipped-adapter-runtime.js';
import { InvokeRouteError } from './adapter-http-errors.js';

export async function executeAdapterInvoke(input: {
  methodDef: RegisterableAdapterMethod;
  source: string;
  method: string;
  params: unknown;
  scenarioRunId?: string;
  liveDeps: AdapterLiveDeps;
}): Promise<unknown> {
  if (input.scenarioRunId !== undefined) {
    const run = getScenarioRun(input.scenarioRunId);
    if (run === undefined) {
      throw new InvokeRouteError('adapter_scenario_run_unknown', 404, {
        code: 'adapter_scenario_run_unknown',
        message: `Unknown scenario run ${input.scenarioRunId}. Rerun dev:once for this scenario or remove tmp/dev/active-scenario-run.json.`,
        source: input.source,
        method: input.method,
        scenarioRunId: input.scenarioRunId,
      });
    }
    return dequeueScenarioResult(run, {
      source: input.source,
      method: input.method,
      params: input.params as Record<string, unknown>,
    });
  }

  const deps = input.liveDeps[input.source];
  if (deps === undefined) {
    throw new InvokeRouteError('adapter_live_deps_missing', 500, {
      code: 'adapter_live_deps_missing',
      message: `Live deps missing for adapter source ${input.source}. Mount the source in the manifest and configure env for apps/adapters.`,
      source: input.source,
      method: input.method,
    });
  }
  return await input.methodDef.invokeLive(input.params, deps);
}

function dequeueScenarioResult(
  run: ScenarioRunRecord,
  input: {
    source: string;
    method: string;
    params: Record<string, unknown>;
  },
): unknown {
  return run.queue.dequeue(input);
}

export { ScenarioAdapterQueueError };
