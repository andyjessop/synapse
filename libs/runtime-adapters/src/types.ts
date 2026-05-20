import type { z } from 'zod';

export type AdapterMethodBoundary = {
  reason: string;
  scenarioFixtureable: boolean;
  sharedAcrossProcesses: boolean;
};

export type AdapterMethodDefinition<Params, Result, Deps = unknown> = {
  source: string;
  method: string;
  description: string;
  boundary: AdapterMethodBoundary;
  paramsSchema: z.ZodType<Params>;
  resultSchema: z.ZodType<Result>;
  invokeLive: (params: Params, deps: Deps) => Promise<Result>;
};

/**
 * Erased method shape stored in the runtime registry.
 * Concrete `defineAdapterMethod` modules stay fully typed; registration accepts this widened form.
 */
export type RegisterableAdapterMethod = AdapterMethodDefinition<
  // biome-ignore lint/suspicious/noExplicitAny: registry erasure boundary
  any,
  // biome-ignore lint/suspicious/noExplicitAny: registry erasure boundary
  any,
  // biome-ignore lint/suspicious/noExplicitAny: registry erasure boundary
  any
>;

export type AdapterInvokeInput = {
  source: string;
  method: string;
  /** Optional on input; normalized to {} before serialize, parse, and fixture match. */
  params?: Record<string, unknown>;
  /** Required — copied into errors and structured logs. */
  agentName: string;
  scenarioRunId?: string;
};

export type AdapterErrorBody = {
  error: {
    code: string;
    message: string;
    source?: string;
    method?: string;
    agentName?: string;
    fieldPath?: string;
    valueKind?: string;
    hint?: string;
    callerAction?: string;
    zodIssue?: string;
    scenarioRunId?: string;
  };
};

export type AdapterPort = {
  invoke(input: AdapterInvokeInput): Promise<unknown>;
};

export type ResolvedScenarioAdapterFixture = {
  source: string;
  method: string;
  params?: Record<string, unknown>;
  returns: unknown;
};

export type InstallScenarioRunRequest = {
  scenarioId: string;
  adapters: ResolvedScenarioAdapterFixture[];
};

export type InstallScenarioRunResponse = {
  scenarioRunId: string;
};
