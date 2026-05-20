import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pollingRoot = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../src/polling',
);

const agentImportPattern =
  /from\s+['"](?:\.\.\/)*(?:agents|examples\/agents)\//;

describe('polling import boundary', () => {
  it('only registrars may import application agent packages', () => {
    const violations: string[] = [];
    for (const file of listPollingTsFiles(pollingRoot)) {
      if (file.includes('/registrars/')) {
        continue;
      }
      const source = readFileSync(file, 'utf8');
      if (agentImportPattern.test(source)) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]);
  });
});

function listPollingTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listPollingTsFiles(path));
      continue;
    }
    if (entry.name.endsWith('.ts')) {
      files.push(path);
    }
  }
  return files;
}
