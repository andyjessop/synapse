import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  parseRuntimeManifestFile,
  parseRuntimeManifestJson,
} from '../../src/parse.js';
import { manifestDocumentBase } from '../helpers/manifest-document-base.js';

const repoRoot = join(fileURLToPath(new URL('../../../..', import.meta.url)));

describe('parseRuntimeManifest', () => {
  it('parseRuntimeManifestJson parses inline manifest objects', () => {
    const manifest = parseRuntimeManifestJson({
      ...manifestDocumentBase,
      name: 'inline',
      agents: [
        {
          name: 'example-echo',
          handler: 'examples/agents/example-agent-echo/src/echo-agent.ts',
          handles: ['example.ping.v1'],
        },
      ],
    });
    expect(manifest.name).toBe('inline');
  });

  it('parseRuntimeManifestFile reads application.json from disk', () => {
    const manifest = parseRuntimeManifestFile(
      join(repoRoot, 'manifests/application.json'),
    );
    expect(manifest.agents.some((a) => a.name === 'agent-reviewer')).toBe(true);
  });
});
