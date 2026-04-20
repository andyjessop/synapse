import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  findLatestDevRunSnapshotRelativePath,
  waitForLatestDevRunSnapshotRelativePath,
} from './resolve-dev-run-snapshot.js';

describe('findLatestDevRunSnapshotRelativePath', () => {
  it('returns the newest matching artifact by timestamp prefix', () => {
    const repoRoot = join(tmpdir(), `synapse-dev-runs-${Date.now()}`);
    const runsDir = join(repoRoot, 'tmp', 'dev', 'runs');
    mkdirSync(runsDir, { recursive: true });
    const eventId = 'evt_0123456789abcdef0123456789abcdef';
    writeFileSync(join(runsDir, `20260101000000_${eventId}.json`), '{}');
    writeFileSync(join(runsDir, `20260102000000_${eventId}.json`), '{}');

    expect(findLatestDevRunSnapshotRelativePath(repoRoot, eventId)).toBe(
      join('tmp', 'dev', 'runs', `20260102000000_${eventId}.json`),
    );
  });
});

describe('waitForLatestDevRunSnapshotRelativePath', () => {
  it('resolves once the file appears', async () => {
    const repoRoot = join(tmpdir(), `synapse-dev-runs-wait-${Date.now()}`);
    const runsDir = join(repoRoot, 'tmp', 'dev', 'runs');
    mkdirSync(runsDir, { recursive: true });
    const eventId = 'evt_abcdef0123456789abcdef0123456789';
    setTimeout(() => {
      writeFileSync(join(runsDir, `20260103000000_${eventId}.json`), '{}');
    }, 50);

    const path = await waitForLatestDevRunSnapshotRelativePath(
      repoRoot,
      eventId,
      { maxPolls: 10, pollMs: 20 },
    );
    expect(path).toBe(
      join('tmp', 'dev', 'runs', `20260103000000_${eventId}.json`),
    );
  });
});
