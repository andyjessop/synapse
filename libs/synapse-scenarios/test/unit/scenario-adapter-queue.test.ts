import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ScenarioAdapter } from 'runtime-manifest';
import { describe, expect, it } from 'vitest';

import { createScenarioAdapterQueue } from '../../src/runtime/scenario-adapter-queue.js';

const repoRoot = join(fileURLToPath(new URL('../../../..', import.meta.url)));

describe('createScenarioAdapterQueue', () => {
  it('dequeues FIFO for identical source+method+params', () => {
    const adapters: ScenarioAdapter[] = [
      {
        source: 'foo',
        method: 'get',
        params: { key: 'counter' },
        returns: { data: { value: 0 } },
      },
      {
        source: 'foo',
        method: 'get',
        params: { key: 'counter' },
        returns: { data: { value: 1 } },
      },
    ];
    const queue = createScenarioAdapterQueue(adapters, 'example/fifo');
    expect(
      queue.dequeue({
        source: 'foo',
        method: 'get',
        params: { key: 'counter' },
        repoRoot,
      }),
    ).toEqual({ value: 0 });
    expect(
      queue.dequeue({
        source: 'foo',
        method: 'get',
        params: { key: 'counter' },
        repoRoot,
      }),
    ).toEqual({ value: 1 });
  });
});
