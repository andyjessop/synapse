import { describe, expect, it } from 'vitest';

import { parseWorkerCliManifest } from '../../src/main.js';

describe('parseWorkerCliManifest', () => {
  it('reads --manifest path', () => {
    expect(
      parseWorkerCliManifest(['--manifest', 'manifests/examples/echo.json']),
    ).toBe('manifests/examples/echo.json');
  });

  it('throws when --manifest has no value', () => {
    expect(() => parseWorkerCliManifest(['--manifest'])).toThrow(
      /--manifest requires a path/,
    );
  });
});
