import type { RegisterableAdapterMethod } from 'runtime-adapters';
import {
  loadMountedAdapterSources,
  type RuntimeManifest,
} from 'runtime-manifest';

import {
  adapterMethodRegistry,
  adapterSourceMethods,
  isKnownAdapterSource,
} from '../shipped-adapter-runtime.js';
import type { ParseAdapterRequestFailure } from './parse-adapter-request.js';

export type ResolvedAdapterMethod = {
  methodDef: RegisterableAdapterMethod;
};

export function resolveAdapterMethod(input: {
  manifest: RuntimeManifest;
  source: string;
  method: string;
}):
  | { ok: true; value: ResolvedAdapterMethod }
  | { ok: false; failure: ParseAdapterRequestFailure } {
  if (!isKnownAdapterSource(input.source)) {
    return {
      ok: false,
      failure: {
        status: 404,
        error: {
          code: 'adapter_source_unknown',
          message: `Unknown adapter source: ${input.source}`,
          source: input.source,
          method: input.method,
        },
      },
    };
  }

  const mounted = loadMountedAdapterSources(input.manifest);
  if (!mounted.has(input.source)) {
    return {
      ok: false,
      failure: {
        status: 404,
        error: {
          code: 'adapter_source_not_mounted',
          message: `Adapter source ${input.source} is not mounted on manifest ${input.manifest.name}`,
          source: input.source,
          method: input.method,
        },
      },
    };
  }

  const catalogMethods = adapterSourceMethods(input.source);
  if (
    !catalogMethods.includes(input.method as (typeof catalogMethods)[number])
  ) {
    return {
      ok: false,
      failure: {
        status: 404,
        error: {
          code: 'adapter_method_unknown',
          message: `Unknown method ${input.method} for source ${input.source}`,
          source: input.source,
          method: input.method,
        },
      },
    };
  }

  const methodDef = adapterMethodRegistry.get(input.source, input.method);
  if (methodDef === undefined) {
    return {
      ok: false,
      failure: {
        status: 404,
        error: {
          code: 'adapter_method_unknown',
          message: `Method ${input.method} is not registered for ${input.source}`,
          source: input.source,
          method: input.method,
        },
      },
    };
  }

  return { ok: true, value: { methodDef } };
}
