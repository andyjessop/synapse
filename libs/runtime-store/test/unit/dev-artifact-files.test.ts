import { describe, expect, it } from 'vitest';
import {
  devRunSnapshotArtifactFileName,
  formatDevArtifactTimestamp,
  formatDevJsonFileBody,
} from '../../src/dev-artifact-files';

const EVENT_ID = `evt_${'c'.repeat(32)}`;

describe('dev artifact files', () => {
  it('formats timestamps for lexicographic sort', () => {
    expect(formatDevArtifactTimestamp(new Date('2026-05-18T11:51:57'))).toBe(
      '20260518115157',
    );
  });

  it('names run snapshot files with timestamp prefix', () => {
    const at = new Date('2026-05-18T12:00:00');
    expect(devRunSnapshotArtifactFileName(EVENT_ID, at)).toBe(
      `20260518120000_${EVENT_ID}.json`,
    );
  });

  it('pretty-prints JSON with trailing newline', () => {
    const body = formatDevJsonFileBody({ a: 1 });
    expect(body).toBe('{\n  "a": 1\n}\n');
    expect(JSON.parse(body.trim())).toEqual({ a: 1 });
  });
});
