import { buildShippedAdapterRuntime } from 'runtime-adapters';

import { shippedAdapters } from './shipped-adapters.js';

export const builtShippedAdapterRuntime =
  buildShippedAdapterRuntime(shippedAdapters);

export const adapterMethodRegistry = builtShippedAdapterRuntime.methodRegistry;

export const SHIPPED_ADAPTER_SOURCES =
  builtShippedAdapterRuntime.shippedAdapterSources;

export type AdapterLiveDeps = Record<string, unknown>;

export const createAdapterLiveDeps: (
  env: Record<string, string | undefined>,
) => AdapterLiveDeps = builtShippedAdapterRuntime.createLiveDeps;

export function listShippedAdapterSourceIds(): string[] {
  return Object.keys(SHIPPED_ADAPTER_SOURCES);
}

export function isKnownAdapterSource(source: string): boolean {
  return source in SHIPPED_ADAPTER_SOURCES;
}

export function adapterSourceMethods(source: string): readonly string[] {
  return SHIPPED_ADAPTER_SOURCES[source]?.methods ?? [];
}
