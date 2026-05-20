import type { AdapterSourceDefinition } from './define-adapter-source.js';
import {
  type AdapterMethodRegistry,
  createAdapterMethodRegistry,
} from './registry.js';
import type { ShippedAdapterSourceEntry } from './shipped-adapter-catalog.js';
import type { RegisterableAdapterMethod } from './types.js';

export type BuiltShippedAdapterRuntime = {
  readonly sources: readonly AdapterSourceDefinition[];
  readonly methodRegistry: AdapterMethodRegistry;
  readonly shippedAdapterSources: Record<string, ShippedAdapterSourceEntry>;
  readonly createLiveDeps: (
    env: Record<string, string | undefined>,
  ) => Record<string, unknown>;
};

export function buildShippedAdapterRuntime(
  sources: readonly AdapterSourceDefinition[],
): BuiltShippedAdapterRuntime {
  const methods: RegisterableAdapterMethod[] = [];
  const shippedAdapterSources: Record<string, ShippedAdapterSourceEntry> = {};

  for (const sourceDef of sources) {
    if (shippedAdapterSources[sourceDef.source] !== undefined) {
      throw new Error(`Adapter source registered twice: ${sourceDef.source}`);
    }
    const methodNames: string[] = [];
    for (const [methodName, methodDef] of Object.entries(sourceDef.methods)) {
      methods.push(methodDef);
      methodNames.push(methodName);
    }
    methodNames.sort();
    shippedAdapterSources[sourceDef.source] = {
      description: sourceDef.description,
      methods: methodNames,
    };
  }

  const methodRegistry = createAdapterMethodRegistry(methods);

  return {
    sources,
    methodRegistry,
    shippedAdapterSources,
    createLiveDeps(env) {
      const bag: Record<string, unknown> = {};
      for (const sourceDef of sources) {
        const live = sourceDef.createLiveDeps(env);
        if (live !== undefined) {
          bag[sourceDef.source] = live;
        }
      }
      return bag;
    },
  };
}
