import { describe, expect, it } from 'vitest';

import {
  ellipsizePath,
  formatPiToolActivitySummary,
  truncateVisible,
} from '../../src/pi-harness-tool-activity';

describe('formatPiToolActivitySummary', () => {
  it('formats read with path', () => {
    expect(
      formatPiToolActivitySummary('read', { path: 'libs/foo/README.md' }),
    ).toBe('read libs/foo/README.md');
  });

  it('formats grep with pattern and path', () => {
    expect(
      formatPiToolActivitySummary('grep', {
        pattern: 'TODO',
        path: 'apps/worker/src',
      }),
    ).toBe('grep TODO in apps/worker/src');
  });

  it('formats find with pattern and path', () => {
    expect(
      formatPiToolActivitySummary('find', {
        pattern: '*.ts',
        path: 'libs',
      }),
    ).toBe('find *.ts under libs');
  });

  it('formats ls with optional path', () => {
    expect(formatPiToolActivitySummary('ls', {})).toBe('ls .');
    expect(formatPiToolActivitySummary('ls', { path: 'tmp' })).toBe('ls tmp');
  });

  it('formats bash command', () => {
    expect(
      formatPiToolActivitySummary('bash', { command: 'git status --short' }),
    ).toBe('bash git status --short');
  });

  it('formats write path and content size', () => {
    expect(
      formatPiToolActivitySummary('write', {
        path: 'out.md',
        content: 'hello',
      }),
    ).toBe('write out.md (5 chars)');
  });

  it('formats edit path and patch count', () => {
    expect(
      formatPiToolActivitySummary('edit', {
        path: 'src/foo.ts',
        edits: [{ oldText: 'a', newText: 'b' }],
      }),
    ).toBe('edit src/foo.ts (1 patch)');
  });

  it('relativizes absolute paths under repoRoot', () => {
    expect(
      formatPiToolActivitySummary(
        'read',
        { path: '/tmp/proj/libs/foo.ts' },
        '/tmp/proj',
      ),
    ).toBe('read libs/foo.ts');
  });
});

describe('ellipsizePath', () => {
  it('returns short paths unchanged', () => {
    expect(ellipsizePath('a/b')).toBe('a/b');
  });

  it('truncates long paths with a leading ellipsis', () => {
    const long = `/${'x'.repeat(80)}/tail.ts`;
    const out = ellipsizePath(long, 20);
    expect(out.startsWith('…')).toBe(true);
    expect(out).toContain('tail.ts');
  });
});

describe('truncateVisible', () => {
  it('collapses whitespace', () => {
    expect(truncateVisible('  a  \n b  ', 10)).toBe('a b');
  });
});
