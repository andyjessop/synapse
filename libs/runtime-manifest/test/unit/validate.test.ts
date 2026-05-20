import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateScenarioForManifest } from 'synapse-scenarios';
import { describe, expect, it } from 'vitest';
import {
  parseRuntimeManifestFile,
  parseRuntimeManifestJson,
  type RuntimeManifest,
  validateRuntimeManifest,
} from '../../src/index.js';
import { manifestDocumentBase } from '../helpers/manifest-document-base.js';
import {
  testKnownEventTypes,
  testShippedAgentsByName,
} from '../helpers/test-manifest-load-deps.js';

const repoRoot = join(fileURLToPath(new URL('../../../..', import.meta.url)));

describe('validateRuntimeManifest', () => {
  function validate(
    manifest: RuntimeManifest,
    manifestPath = join(repoRoot, 'manifests/test.json'),
  ) {
    return validateRuntimeManifest(manifest, {
      manifestPath,
      repoRoot,
      knownEventTypes: testKnownEventTypes,
      shippedAgents: testShippedAgentsByName,
      validateScenarioForManifest,
    });
  }

  it('rejects unknown event types', () => {
    const manifest = parseRuntimeManifestJson({
      ...manifestDocumentBase,
      name: 'test',
      agents: [{ name: 'agent-reviewer' }],
    });
    const agents = new Map(testShippedAgentsByName);
    agents.set('agent-reviewer', {
      ...testShippedAgentsByName.get('agent-reviewer')!,
      handles: ['unknown.event.v1'],
    });
    expect(() =>
      validateRuntimeManifest(manifest, {
        manifestPath: join(repoRoot, 'manifests/test.json'),
        repoRoot,
        knownEventTypes: testKnownEventTypes,
        shippedAgents: agents,
        validateScenarioForManifest,
      }),
    ).toThrow(/handles unknown event type/);
  });

  it('rejects unknown shipped agent', () => {
    const manifest = parseRuntimeManifestJson({
      ...manifestDocumentBase,
      name: 'test',
      agents: [{ name: 'agent-unknown' }],
    });
    expect(() => validate(manifest)).toThrow(/Manifest mounts unknown agent/);
  });

  it('rejects usesAdapters not mounted on manifest', () => {
    const manifest = parseRuntimeManifestJson({
      ...manifestDocumentBase,
      name: 'test',
      agents: [{ name: 'agent-reviewer' }],
      adapters: [],
    });
    expect(() => validate(manifest)).toThrow(
      /uses adapter .* but manifest does not mount/,
    );
  });

  it('rejects duplicate webhook sources', () => {
    const manifest = parseRuntimeManifestJson({
      ...manifestDocumentBase,
      name: 'dup-webhooks',
      agents: [{ name: 'example-echo' }],
      webhooks: [
        { source: 'synapse.webhooks.example-echo-ping.v1' },
        { source: 'synapse.webhooks.example-echo-ping.v1' },
      ],
    });
    expect(() => validate(manifest)).toThrow(/Duplicate webhook source/);
  });

  it('rejects duplicate agent names', () => {
    const dup = parseRuntimeManifestJson({
      ...manifestDocumentBase,
      name: 'dup',
      agents: [{ name: 'example-echo' }, { name: 'example-echo' }],
    });
    expect(() => validate(dup)).toThrow(/Duplicate manifest agent name/);
  });

  it('rejects duplicate scenario ids across scenario files for one manifest', () => {
    const manifest = parseRuntimeManifestJson({
      ...manifestDocumentBase,
      name: 'dup-scenario-ids',
      agents: [{ name: 'example-echo' }],
      webhooks: [{ source: 'synapse.webhooks.example-echo-ping.v1' }],
    });
    expect(() => validate(manifest)).toThrow(/Duplicate scenario id/);
  });

  it('rejects scenario whose ingress source is not mounted on manifest', () => {
    const manifest = parseRuntimeManifestJson({
      ...manifestDocumentBase,
      name: 'example-echo',
      agents: [{ name: 'example-echo' }],
    });
    expect(() => validate(manifest)).toThrow(/not mounted/);
  });

  it('accepts application manifest with scenario manifests binding', () => {
    const manifest = parseRuntimeManifestFile(
      join(repoRoot, 'manifests/application.json'),
    );
    expect(() =>
      validate(manifest, join(repoRoot, 'manifests/application.json')),
    ).not.toThrow();
  });

  it('validates scenarios that declare the manifest name', () => {
    const manifest = parseRuntimeManifestFile(
      join(repoRoot, 'manifests/examples/echo.json'),
    );
    expect(() =>
      validate(manifest, join(repoRoot, 'manifests/examples/echo.json')),
    ).not.toThrow();
  });
});
