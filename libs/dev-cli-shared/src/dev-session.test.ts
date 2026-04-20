import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readDevSession } from './dev-session.js';

describe('readDevSession', () => {
  it('fails clearly when .synapse/dev-session.json is missing', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'synapse-no-dev-session-'));
    expect(() => readDevSession(repoRoot)).toThrow(
      /Missing \.synapse\/dev-session\.json.*npm run dev/,
    );
  });
});
