import { describe, expect, it } from 'vitest';

describe('scheduleIngressRunSnapshot', () => {
  it('is importable without throwing (background work is skipped under Vitest)', async () => {
    const { scheduleIngressRunSnapshot } = await import(
      '../../src/ingress-run-snapshot.js'
    );
    expect(typeof scheduleIngressRunSnapshot).toBe('function');
    expect(() =>
      scheduleIngressRunSnapshot({
        pool: {} as never,
        repoRoot: '/tmp',
        inputEventId: 'evt_x',
        scenarioId: 'ingress:test',
        terminalEventTypes: ['a.b.v1'],
      }),
    ).not.toThrow();
  });
});
