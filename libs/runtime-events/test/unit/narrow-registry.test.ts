import { describe, expect, it } from 'vitest';
import { type EventType, eventRegistry, isEventType } from '../../src/index';

const simplifiedRuntimeEventTypesSorted = [
  'chat.answer.v1',
  'chat.closed.v1',
  'chat.question.v1',
  'custom.unknown.v1',
  'example.bad.v1',
  'example.child.v1',
  'example.dead-end.v1',
  'example.double.v1',
  'example.emit-only.v1',
  'example.emitted.v1',
  'example.fail-run.v1',
  'example.fail.v1',
  'example.fast.done.v1',
  'example.fast.v1',
  'example.hang.v1',
  'example.legacy-fail.v1',
  'example.legacy-ok.v1',
  'example.loop.v1',
  'example.nosubject.v1',
  'example.parent.v1',
  'example.ping.v1',
  'example.pong.v1',
  'example.slow.done.v1',
  'example.slow.v1',
  'example.sqlite.count.requested.v1',
  'example.sqlite.count.updated.v1',
  'example.sqlite.note.append.v1',
  'example.sqlite.note.stored.v1',
  'example.throw-after.v1',
  'example.toggle-fail.v1',
  'example.toggle-ok.v1',
  'example.unsubscribed.v1',
  'notify.broadcast.v1',
  'notify.email.v1',
  'notify.slack.v1',
  'pi.tool-call.completed.v1',
  'pi.tool-call.started.v1',
  'pipeline.done.v1',
  'pipeline.parsed.v1',
  'pipeline.raw.v1',
  'pr.received.v1',
  'pr.reviewed.v1',
  'runtime.fixture.signal.v1',
  'ticket.notified.v1',
  'ticket.opened.v1',
] as const satisfies readonly EventType[];

describe('simplified runtime event registry', () => {
  it('contains exactly the allowed event type keys (sorted)', () => {
    const fromRegistry = (Object.keys(eventRegistry) as EventType[]).sort(
      (a, b) => a.localeCompare(b),
    );
    expect(fromRegistry).toEqual([...simplifiedRuntimeEventTypesSorted]);
  });

  it('does not register removed runtime families', () => {
    for (const removed of [
      'agent.ready.v1',
      'relay.ready.v1',
      'fixture.proxy.intent.v1',
      'external.signal.v1',
    ]) {
      expect(isEventType(removed)).toBe(false);
    }
  });
});
