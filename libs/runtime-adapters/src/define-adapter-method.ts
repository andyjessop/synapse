import type { AdapterMethodDefinition } from './types.js';

export function defineAdapterMethod<Params, Result, Deps = unknown>(
  definition: AdapterMethodDefinition<Params, Result, Deps>,
): AdapterMethodDefinition<Params, Result, Deps> {
  return definition;
}
