import { describe, expect, it } from 'vitest';
import {
  EVENT_TYPE_SEGMENT_PATTERN,
  EVENT_TYPE_VERSION_PATTERN,
  type EventType,
  eventRegistry,
} from '../../src/index';

describe('event type segment and version patterns', () => {
  it('exports patterns that match §4 naming rules', () => {
    expect(EVENT_TYPE_SEGMENT_PATTERN.test('jira')).toBe(true);
    expect(EVENT_TYPE_SEGMENT_PATTERN.test('ticket')).toBe(true);
    expect(EVENT_TYPE_SEGMENT_PATTERN.test('dead-lettered')).toBe(true);
    expect(EVENT_TYPE_SEGMENT_PATTERN.test('Bad')).toBe(false);
    expect(EVENT_TYPE_SEGMENT_PATTERN.test('')).toBe(false);

    expect(EVENT_TYPE_VERSION_PATTERN.test('v1')).toBe(true);
    expect(EVENT_TYPE_VERSION_PATTERN.test('v12')).toBe(true);
    expect(EVENT_TYPE_VERSION_PATTERN.test('v0')).toBe(false);
    expect(EVENT_TYPE_VERSION_PATTERN.test('1')).toBe(false);
  });

  it('splits every registered type into valid segments and a valid version', () => {
    for (const type of Object.keys(eventRegistry) as EventType[]) {
      const parts = type.split('.');
      expect(parts.length).toBeGreaterThanOrEqual(3);
      const version = parts[parts.length - 1];
      const segments = parts.slice(0, -1);
      expect(EVENT_TYPE_VERSION_PATTERN.test(version)).toBe(true);
      for (const seg of segments) {
        expect(EVENT_TYPE_SEGMENT_PATTERN.test(seg)).toBe(true);
      }
    }
  });
});
