import type { RegisterableAdapterMethod } from './types.js';

export type AdapterMethodRegistry = {
  get(source: string, method: string): RegisterableAdapterMethod | undefined;
  list(): readonly RegisterableAdapterMethod[];
  methodKey(source: string, method: string): string;
};

export function createAdapterMethodRegistry(
  methods: readonly RegisterableAdapterMethod[],
): AdapterMethodRegistry {
  const byKey = new Map<string, RegisterableAdapterMethod>();
  for (const method of methods) {
    const key = methodKey(method.source, method.method);
    if (byKey.has(key)) {
      throw new Error(
        `${method.source}.${method.method} registered twice in adapter method registry`,
      );
    }
    byKey.set(key, method);
  }

  return {
    get(source, method) {
      return byKey.get(methodKey(source, method));
    },
    list() {
      return methods;
    },
    methodKey,
  };
}

/** Register shipped adapter method modules for `apps/adapters`. */
export function registerAdapterMethods(
  ...methods: RegisterableAdapterMethod[]
): AdapterMethodRegistry {
  return createAdapterMethodRegistry(methods);
}

export function methodKey(source: string, method: string): string {
  return `${source}\0${method}`;
}
