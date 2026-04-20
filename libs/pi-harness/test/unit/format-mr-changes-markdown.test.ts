import { describe, expect, it } from 'vitest';

import { formatMrChangesAsMarkdown } from '../../src/tools/format-mr-changes-markdown.js';

describe('formatMrChangesAsMarkdown', () => {
  it('formats file sections with diff fences', () => {
    const markdown = formatMrChangesAsMarkdown({
      project_id: 202,
      merge_request_iid: 42,
      changes: [
        {
          old_path: 'src/a.ts',
          new_path: 'src/a.ts',
          diff: '@@ -1 +1 @@\n-old\n+new\n',
        },
      ],
    });
    expect(markdown).toContain('# Merge request changes');
    expect(markdown).toContain('project_id=202');
    expect(markdown).toContain('## src/a.ts');
    expect(markdown).toContain('```diff');
  });

  it('truncates total output beyond 96 KiB', () => {
    const bigDiff = 'x'.repeat(50 * 1024);
    const markdown = formatMrChangesAsMarkdown({
      project_id: 1,
      merge_request_iid: 1,
      changes: [
        {
          old_path: 'a.ts',
          new_path: 'a.ts',
          diff: bigDiff,
        },
        {
          old_path: 'b.ts',
          new_path: 'b.ts',
          diff: bigDiff,
        },
        {
          old_path: 'c.ts',
          new_path: 'c.ts',
          diff: bigDiff,
        },
      ],
    });
    expect(markdown).toContain('<!-- truncated:');
    expect(Buffer.byteLength(markdown, 'utf8')).toBeLessThanOrEqual(
      96 * 1024 + 200,
    );
  });
});
