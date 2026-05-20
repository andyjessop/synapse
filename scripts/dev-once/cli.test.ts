import { describe, expect, it } from 'vitest';

import { parseDevOnceArgv, printDevOnceHelp } from './cli.js';

describe('parseDevOnceArgv', () => {
  it('parses --manifest', () => {
    expect(
      parseDevOnceArgv([
        '--manifest',
        'manifests/examples/echo.json',
        '--scenario',
        'example/echo',
      ]).manifestPath,
    ).toBe('manifests/examples/echo.json');
    expect(
      parseDevOnceArgv([
        '--manifest=manifests/examples/echo.json',
        'example/echo',
      ]).manifestPath,
    ).toBe('manifests/examples/echo.json');
  });

  it('rejects --examples', () => {
    expect(() => parseDevOnceArgv(['--examples'])).toThrow(
      /dev:once does not accept --examples/,
    );
  });

  it('rejects --clean on dev:once', () => {
    expect(() =>
      parseDevOnceArgv(['--clean', '--scenario', 'example/echo']),
    ).toThrow(/dev:once:clean/);
  });

  it('enables clean from SYNAPSE_DEV_ONCE_CLEAN', () => {
    const prev = process.env.SYNAPSE_DEV_ONCE_CLEAN;
    process.env.SYNAPSE_DEV_ONCE_CLEAN = '1';
    try {
      expect(parseDevOnceArgv(['--scenario', 'example/echo']).clean).toBe(true);
    } finally {
      if (prev === undefined) {
        delete process.env.SYNAPSE_DEV_ONCE_CLEAN;
      } else {
        process.env.SYNAPSE_DEV_ONCE_CLEAN = prev;
      }
    }
  });

  it('parses --fixture and --scenario as scenario id', () => {
    expect(
      parseDevOnceArgv(['--fixture', 'review-pr/gitlab-synapse']).scenarioId,
    ).toBe('review-pr/gitlab-synapse');
    expect(parseDevOnceArgv(['--scenario', 'example/echo']).scenarioId).toBe(
      'example/echo',
    );
  });

  it('documents dev stack prerequisite in help', () => {
    const lines: string[] = [];
    const orig = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    printDevOnceHelp();
    process.stdout.write = orig;
    const text = lines.join('');
    expect(text).toContain('npm run dev');
    expect(text).toContain('manifests/application.json');
  });
});
