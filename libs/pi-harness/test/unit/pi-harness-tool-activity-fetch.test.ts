import { describe, expect, it } from 'vitest';

import { formatPiToolActivitySummary } from '../../src/pi-harness-tool-activity.js';

describe('formatPiToolActivitySummary fetch_merge_request_diff', () => {
  it('formats project_id and merge_request_iid', () => {
    expect(
      formatPiToolActivitySummary('fetch_merge_request_diff', {
        project_id: 202,
        merge_request_iid: 42,
      }),
    ).toBe('fetch_merge_request_diff project_id=202 iid=42');
  });
});
