import { describe, expect, it } from 'vitest';
import { workerLifecycleEnvelopeIds } from '../../src/worker-lifecycle';

describe('workerLifecycleEnvelopeIds', () => {
  it('uses the same value for id and correlationid', () => {
    const a = workerLifecycleEnvelopeIds();
    const b = workerLifecycleEnvelopeIds();
    expect(a.id).toBe(a.correlationid);
    expect(b.id).toBe(b.correlationid);
    expect(a.id).not.toBe(b.id);
  });
});
