import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ingressSrcRoot = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../src',
);

function collectTsFiles(dir: string): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      paths.push(...collectTsFiles(abs));
      continue;
    }
    if (entry.name.endsWith('.ts')) {
      paths.push(abs);
    }
  }
  return paths;
}

describe('ingress package boundaries', () => {
  it('does not import synapse-scenarios', () => {
    const offenders: string[] = [];
    for (const file of collectTsFiles(ingressSrcRoot)) {
      const text = readFileSync(file, 'utf8');
      if (/from\s+['"]synapse-scenarios['"]/.test(text)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
