import { describe, expect, it } from 'vitest';

import { gitLabMrChangesSchema } from '../../src/schemas.js';

describe('gitLabMrChangesSchema', () => {
  it('parses a minimal MR changes payload', () => {
    const parsed = gitLabMrChangesSchema.parse({
      project_id: 202,
      merge_request_iid: 42,
      changes: [
        {
          old_path: 'a.ts',
          new_path: 'a.ts',
          diff: '@@ -1 +1 @@\n-old\n+new\n',
        },
      ],
    });
    expect(parsed.project_id).toBe(202);
    expect(parsed.changes).toHaveLength(1);
  });

  it('rejects unknown keys', () => {
    expect(() =>
      gitLabMrChangesSchema.parse({
        project_id: 1,
        merge_request_iid: 1,
        changes: [],
        extra: true,
      }),
    ).toThrow();
  });
});
