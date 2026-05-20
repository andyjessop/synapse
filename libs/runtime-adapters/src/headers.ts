export const SCENARIO_RUN_ID_HEADER = 'x-synapse-scenario-run-id';

export function scenarioRunIdFromHeaders(
  headers: Headers | Record<string, string | undefined>,
): string | undefined {
  if (headers instanceof Headers) {
    return headers.get(SCENARIO_RUN_ID_HEADER) ?? undefined;
  }
  const direct = headers[SCENARIO_RUN_ID_HEADER];
  if (direct !== undefined) {
    return direct;
  }
  return headers[SCENARIO_RUN_ID_HEADER.toLowerCase()];
}
