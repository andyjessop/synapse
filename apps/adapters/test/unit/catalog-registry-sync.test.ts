import { describe, expect, it } from 'vitest';

import {
  adapterMethodRegistry,
  SHIPPED_ADAPTER_SOURCES,
} from '../../src/shipped-adapter-runtime.js';
import { shippedAdapters } from '../../src/shipped-adapters.js';

const gitlabAdapter = shippedAdapters.find(
  (source) => source.source === 'synapse.adapters.gitlab.v1',
);
if (gitlabAdapter === undefined) {
  throw new Error('gitlab adapter missing from shippedAdapters');
}

describe('adapter source catalog and method registry', () => {
  it('catalog matches shipped adapter definitions', () => {
    for (const sourceDef of shippedAdapters) {
      const catalog = SHIPPED_ADAPTER_SOURCES[sourceDef.source];
      expect(catalog?.description).toBe(sourceDef.description);
      expect([...catalog!.methods].sort()).toEqual(
        Object.keys(sourceDef.methods).sort(),
      );
    }
  });

  it('registry methods appear in the catalog', () => {
    for (const methodDef of adapterMethodRegistry.list()) {
      const catalog = SHIPPED_ADAPTER_SOURCES[methodDef.source];
      expect(catalog, `${methodDef.source} missing from catalog`).toBeDefined();
      expect(catalog.methods).toContain(methodDef.method);
    }
  });

  it('includes gitlab fetchChanges', () => {
    expect(gitlabAdapter.methods.fetchChanges.source).toBe(
      'synapse.adapters.gitlab.v1',
    );
    expect(
      adapterMethodRegistry.get('synapse.adapters.gitlab.v1', 'fetchChanges'),
    ).toBe(gitlabAdapter.methods.fetchChanges);
    expect(
      SHIPPED_ADAPTER_SOURCES['synapse.adapters.gitlab.v1']?.methods,
    ).toContain('fetchChanges');
  });
});
