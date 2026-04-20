import { describe, expect, it } from 'vitest';
import {
  eventTypeFromTopic,
  eventTypeToTopic,
  validateEventData,
} from '../../src/index';

describe('serialized event data fixture round-trip', () => {
  it('round-trips JSON parse, data validation, topic encoding, and topic decoding', () => {
    const serialized = JSON.stringify({
      type: 'runtime.fixture.signal.v1',
      data: {
        fixture_id: 'fix-1234',
        emitted_at: '2026-05-14T08:00:00.000Z',
        sequence: 1,
      },
    });

    const parsed = JSON.parse(serialized) as {
      type: 'runtime.fixture.signal.v1';
      data: unknown;
    };
    const data = validateEventData(parsed.type, parsed.data);
    const topic = eventTypeToTopic(parsed.type);

    expect(topic).toBe('runtime/fixture/signal/v1');
    expect(eventTypeFromTopic(topic)).toBe(parsed.type);
    expect(data.fixture_id).toBe('fix-1234');
  });
});
