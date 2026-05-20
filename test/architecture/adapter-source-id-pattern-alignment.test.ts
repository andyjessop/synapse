import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ADAPTER_SOURCE_ID_PATTERN as adaptersPattern } from '../../libs/runtime-adapters/src/define-adapter-source.js';
import { ADAPTER_SOURCE_ID_PATTERN as agentPattern } from '../../libs/runtime-agent/src/agent-definition.js';

const repoRoot = join(fileURLToPath(new URL('../..', import.meta.url)));

describe('adapter source id pattern alignment', () => {
  it('runtime-adapters and runtime-agent export identical regex source strings', () => {
    expect(adaptersPattern.source).toBe(agentPattern.source);
    const adaptersFile = readFileSync(
      join(repoRoot, 'libs/runtime-adapters/src/define-adapter-source.ts'),
      'utf8',
    );
    const agentFile = readFileSync(
      join(repoRoot, 'libs/runtime-agent/src/agent-definition.ts'),
      'utf8',
    );
    const adaptersMatch = adaptersFile.match(
      /ADAPTER_SOURCE_ID_PATTERN\s*=\s*(\/[^;]+\/)/,
    );
    const agentMatch = agentFile.match(
      /ADAPTER_SOURCE_ID_PATTERN\s*=\s*(\/[^;]+\/)/,
    );
    expect(adaptersMatch?.[1]).toBe(agentMatch?.[1]);
  });

  const valid = ['synapse.adapters.gitlab.v1', 'synapse.adapters.jira.v2'];
  const invalid = [
    'synapse.adapters.gitlab',
    'synapse.adapters.foo/bar.v1',
    'bad',
  ];

  it('both patterns accept the same valid ids', () => {
    for (const id of valid) {
      expect(adaptersPattern.test(id), id).toBe(true);
      expect(agentPattern.test(id), id).toBe(true);
    }
  });

  it('both patterns reject the same invalid ids', () => {
    for (const id of invalid) {
      expect(adaptersPattern.test(id), id).toBe(false);
      expect(agentPattern.test(id), id).toBe(false);
    }
  });
});
