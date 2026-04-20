import { describe, expect, it } from 'vitest';

import { parseDevOnceArgv, printDevOnceHelp } from './cli.js';

describe('parseDevOnceArgv', () => {
  it('rejects --manifest', () => {
    expect(() =>
      parseDevOnceArgv(['--manifest', 'manifests/examples/echo.json']),
    ).toThrow(/dev:once does not accept --manifest/);
  });

  it('rejects --examples', () => {
    expect(() => parseDevOnceArgv(['--examples'])).toThrow(
      /dev:once does not accept --examples/,
    );
  });

  it('parses --fixture flag', () => {
    const mode = parseDevOnceArgv(['--fixture', 'review-pr/gitlab-synapse']);
    expect(mode.fixtureId).toBe('review-pr/gitlab-synapse');
  });

  it('documents dev-session prerequisite in help', () => {
    const lines: string[] = [];
    const orig = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    printDevOnceHelp();
    process.stdout.write = orig;
    const text = lines.join('');
    expect(text).toContain('dev-session.json');
    expect(text).toContain('npm run dev');
  });
});
