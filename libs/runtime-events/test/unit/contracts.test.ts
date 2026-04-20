import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  agentNameSchema,
  defineEventRegistry,
  type EventType,
  EXAMPLE_AGENT_NOTIFIER,
  EXAMPLE_AGENT_SQLITE_COUNTER,
  eventRegistry,
  eventTypeFromTopic,
  eventTypeToTopic,
  getEventCategory,
  getEventOwner,
  isEventType,
  validateEventData,
} from '../../src/index';

const ticketOpenedData = {
  ticket_id: 'T-1',
  title: 'Ticket',
  body: 'Body',
};

describe('defineEventRegistry', () => {
  it('rejects emitByProxy on non-intent event definitions', () => {
    expect(() =>
      defineEventRegistry({
        'ticket.opened.v1': {
          category: 'signal',
          owner: EXAMPLE_AGENT_NOTIFIER,
          emitByProxy: ['agent-consumer'],
          schema: z.object({ ticket_id: z.string().min(1) }).strict(),
        },
      }),
    ).toThrow(
      /ticket\.opened\.v1 cannot declare emitByProxy unless category is intent/,
    );
  });
});

describe('event registry metadata', () => {
  it('keeps concrete schemas, owners, and categories for every registered event', () => {
    for (const [type, definition] of Object.entries(eventRegistry)) {
      expect(isEventType(type)).toBe(true);
      expect(agentNameSchema.parse(definition.owner)).toBe(definition.owner);
      expect(
        ['signal', 'intent', 'outcome', 'lifecycle'].includes(
          definition.category,
        ),
      ).toBe(true);
    }
  });

  it('exposes category and owner lookup from the registry', () => {
    expect(getEventCategory('ticket.opened.v1')).toBe('signal');
    expect(getEventOwner('ticket.opened.v1')).toBe(EXAMPLE_AGENT_NOTIFIER);
    expect(getEventCategory('example.sqlite.count.updated.v1')).toBe('outcome');
    expect(getEventOwner('example.sqlite.count.updated.v1')).toBe(
      EXAMPLE_AGENT_SQLITE_COUNTER,
    );
  });
});

describe('topic codec and schema validation', () => {
  it('round-trips every registered event type through topic strings', () => {
    for (const type of Object.keys(eventRegistry) as EventType[]) {
      expect(eventTypeFromTopic(eventTypeToTopic(type))).toBe(type);
    }
  });

  it('rejects malformed topics, unknown topics, and invalid event versions', () => {
    expect(() => eventTypeToTopic('Bad.Type.v1' as EventType)).toThrow(
      'Invalid event type',
    );
    expect(() => eventTypeFromTopic('jira/ticket/tagged')).toThrow(
      'Invalid event topic',
    );
    expect(() => eventTypeFromTopic('jira/TICKET/tagged/v1')).toThrow(
      'Invalid event topic',
    );
    expect(() => eventTypeFromTopic('unknown/event/v1')).toThrow(
      'Unknown event type',
    );
  });

  it('validates event data by type', () => {
    expect(validateEventData('ticket.opened.v1', ticketOpenedData)).toEqual(
      ticketOpenedData,
    );
    expect(() =>
      validateEventData('ticket.opened.v1', { ticket_id: 'T-1' }),
    ).toThrow();
  });
});
