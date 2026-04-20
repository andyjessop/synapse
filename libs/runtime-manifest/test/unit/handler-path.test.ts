import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  assertHandlerPathAllowlisted,
  resolveHandlerAbsolutePath,
  resolveHandlerPathForImport,
} from '../../src/handler-path.js';

const repoRoot = join(fileURLToPath(new URL('../../../..', import.meta.url)));
const reviewerHandler = 'agents/agent-reviewer/src/review-pr-agent.ts';

describe('handler path', () => {
  it('rejects .. in handler path', () => {
    expect(() => assertHandlerPathAllowlisted('agents/../x.ts')).toThrow(
      /\.\./,
    );
  });

  it('rejects paths outside allowlist prefixes', () => {
    expect(() =>
      assertHandlerPathAllowlisted('libs/runtime-agent/src/index.ts'),
    ).toThrow(/agents\/ or examples\/agents\//);
  });

  it('resolves allowlisted handler under repo root', () => {
    const abs = resolveHandlerAbsolutePath(repoRoot, reviewerHandler);
    expect(abs).toBe(join(repoRoot, reviewerHandler));
  });

  it('allows non-allowlisted paths under repo when local imports flag is set', () => {
    const path = 'libs/runtime-agent/src/index.ts';
    const abs = resolveHandlerPathForImport(repoRoot, path, {
      SYNAPSE_ALLOW_LOCAL_MANIFEST_IMPORTS: '1',
    });
    expect(abs).toBe(join(repoRoot, path));
  });

  it('still rejects .. when local imports flag is set', () => {
    expect(() =>
      resolveHandlerPathForImport(repoRoot, 'agents/../x.ts', {
        SYNAPSE_ALLOW_LOCAL_MANIFEST_IMPORTS: '1',
      }),
    ).toThrow(/\.\./);
  });
});
