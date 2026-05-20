import type {
  AdapterMethodDefinition,
  RegisterableAdapterMethod,
} from './types.js';

/** Adapter source id: synapse.adapters.{family}.v{N} */
export const ADAPTER_SOURCE_ID_PATTERN =
  /^synapse\.adapters\.[a-z0-9-]+\.v[0-9]+$/;

const METHOD_NAME_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

/** Method entry for a source; {@link defineAdapterMethod} results satisfy this when `Deps` matches source `LiveDeps`. */
export type AdapterSourceMethod<LiveDeps> = AdapterMethodDefinition<
  // biome-ignore lint/suspicious/noExplicitAny: method params vary per method; deps tie to LiveDeps
  any,
  // biome-ignore lint/suspicious/noExplicitAny: method results vary per method; deps tie to LiveDeps
  any,
  LiveDeps
>;

export type AdapterMethodDefinitionsFor<LiveDeps> = Record<
  string,
  AdapterSourceMethod<LiveDeps>
>;

/** Typed input at definition sites; erased to {@link AdapterSourceDefinition} at runtime boundaries. */
export type TypedAdapterSourceDefinition<
  LiveDeps,
  TMethods extends
    AdapterMethodDefinitionsFor<LiveDeps> = AdapterMethodDefinitionsFor<LiveDeps>,
> = {
  readonly source: string;
  readonly description: string;
  readonly createLiveDeps: (
    env: Record<string, string | undefined>,
  ) => LiveDeps | undefined;
  readonly methods: TMethods;
};

/** Erased adapter source stored in shipped lists and built runtime. */
export type AdapterSourceDefinition = {
  readonly source: string;
  readonly description: string;
  readonly createLiveDeps: (
    env: Record<string, string | undefined>,
  ) => unknown | undefined;
  readonly methods: Record<string, RegisterableAdapterMethod>;
};

function assertAdapterSourceId(source: string): void {
  if (!ADAPTER_SOURCE_ID_PATTERN.test(source)) {
    throw new Error(`Invalid adapter source id: ${source}`);
  }
}

export function defineAdapterSource<LiveDeps>(
  definition: TypedAdapterSourceDefinition<LiveDeps>,
): AdapterSourceDefinition {
  assertAdapterSourceId(definition.source);

  for (const [methodName, methodDef] of Object.entries(definition.methods)) {
    if (!METHOD_NAME_PATTERN.test(methodName)) {
      throw new Error(
        `Invalid adapter method name for ${definition.source}: ${methodName}`,
      );
    }
    if (methodDef.source !== definition.source) {
      throw new Error(
        `Method ${methodName} source ${methodDef.source} does not match adapter source ${definition.source}`,
      );
    }
    if (methodDef.method !== methodName) {
      throw new Error(
        `Method record key ${methodName} does not match methodDef.method ${methodDef.method}`,
      );
    }
  }

  return definition;
}
