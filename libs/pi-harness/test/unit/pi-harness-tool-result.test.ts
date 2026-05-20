import { describe, expect, it } from 'vitest';

import { formatPiToolResultSummary } from '../../src/pi-harness-tool-result.js';

describe('formatPiToolResultSummary', () => {
  it('summarizes read truncation from details', () => {
    expect(
      formatPiToolResultSummary(
        'read',
        {
          content: [{ type: 'text', text: 'line1\nline2\n' }],
          details: {
            truncation: {
              truncated: true,
              outputLines: 2,
              totalLines: 400,
            },
          },
        },
        false,
      ),
    ).toBe('read 2/400 lines');
  });

  it('summarizes bash exit code on error', () => {
    expect(
      formatPiToolResultSummary(
        'bash',
        {
          content: [
            {
              type: 'text',
              text: 'stderr\n\nCommand exited with code 2',
            },
          ],
          details: {},
        },
        true,
      ),
    ).toBe('bash exit 2');
  });

  it('summarizes bash success with output line count', () => {
    expect(
      formatPiToolResultSummary(
        'bash',
        {
          content: [{ type: 'text', text: 'one\ntwo\n' }],
          details: {},
        },
        false,
      ),
    ).toBe('bash ok (2 lines output)');
  });
});
