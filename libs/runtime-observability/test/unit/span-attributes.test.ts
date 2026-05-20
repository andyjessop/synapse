import { context, trace } from '@opentelemetry/api';
import { describe, expect, it } from 'vitest';
import {
  buildRuntimeLogFields,
  buildRuntimeSpanAttributes,
  type RuntimeHop,
  runtimeSpanAuditContext,
  runtimeSpanName,
} from '../../src/index';

const runtimeHops: RuntimeHop[] = [
  'ingress.emit',
  'event.validate',
  'event.append',
  'bullmq.enqueue',
  'bullmq.process',
  'reactor.reconcile',
  'reactor.run',
  'reactor.emit',
  'agent_sqlite.open',
  'agent.load_fixture',
  'adapter.request',
  'webhook.request',
  'ingress.request',
  'poll.tick',
  'poll.lock',
];

describe('runtime span attributes', () => {
  it('names every runtime hop consistently', () => {
    expect(runtimeHops.map((hop) => [hop, runtimeSpanName(hop)])).toEqual([
      ['ingress.emit', 'ingress emit'],
      ['event.validate', 'event validate'],
      ['event.append', 'event append'],
      ['bullmq.enqueue', 'bullmq enqueue'],
      ['bullmq.process', 'bullmq process'],
      ['reactor.reconcile', 'reactor reconcile'],
      ['reactor.run', 'reactor run'],
      ['reactor.emit', 'reactor emit'],
      ['agent_sqlite.open', 'agent sqlite open'],
      ['agent.load_fixture', 'agent load fixture'],
      ['adapter.request', 'adapter request'],
      ['webhook.request', 'webhook request'],
      ['ingress.request', 'ingress request'],
      ['poll.tick', 'poll tick'],
      ['poll.lock', 'poll lock'],
    ]);
  });

  it.each(runtimeHops)('builds attributes for %s', (hop) => {
    expect(
      buildRuntimeSpanAttributes({
        hop,
        eventId: 'evt-1',
        eventType: 'example.ping.v1',
        correlationId: 'corr-1',
        causationId: 'cause-1',
        agent: 'example-echo',
        reactor: 'example-ping',
        adapter: 'http',
        jobId: 'job-1',
        queue: 'agent.example-echo.example-ping',
        source: 'fixture',
        topic: 'example/ping/v1',
        operation: 'append',
        result: 'success',
        replay: false,
      }),
    ).toEqual({
      'synapse.runtime.hop': hop,
      'synapse.event.id': 'evt-1',
      'synapse.event.type': 'example.ping.v1',
      'synapse.event.category': 'signal',
      'synapse.correlation.id': 'corr-1',
      'synapse.causation.id': 'cause-1',
      'synapse.agent': 'example-echo',
      'synapse.reactor': 'example-ping',
      'synapse.adapter': 'http',
      'synapse.job.id': 'job-1',
      'synapse.queue': 'agent.example-echo.example-ping',
      'synapse.source': 'fixture',
      'messaging.destination.name': 'example/ping/v1',
      'synapse.operation': 'append',
      'synapse.result': 'success',
      'synapse.replay': false,
    });
  });

  it('uses explicit category and queue destination fallbacks', () => {
    expect(
      buildRuntimeSpanAttributes({
        hop: 'bullmq.enqueue',
        eventType: 'external.unknown.v1',
        eventCategory: 'intent',
        queue: 'example-echo',
      }),
    ).toEqual({
      'synapse.runtime.hop': 'bullmq.enqueue',
      'synapse.event.type': 'external.unknown.v1',
      'synapse.event.category': 'intent',
      'synapse.queue': 'example-echo',
      'messaging.destination.name': 'example-echo',
    });
  });
});

describe('runtime log fields', () => {
  it('extracts durable audit IDs from a span when present', () => {
    const span = trace.wrapSpanContext({
      traceId: '11111111111111111111111111111111',
      spanId: '2222222222222222',
      traceFlags: 1,
    });

    expect(runtimeSpanAuditContext(span)).toEqual({
      traceId: '11111111111111111111111111111111',
      spanId: '2222222222222222',
    });
    expect(runtimeSpanAuditContext(undefined)).toBeUndefined();
  });

  it('joins logs to active spans when trace fields are not provided', () => {
    const span = trace.wrapSpanContext({
      traceId: '11111111111111111111111111111111',
      spanId: '2222222222222222',
      traceFlags: 1,
    });

    expect(
      buildRuntimeLogFields(
        {
          event_id: 'evt-1',
          correlation_id: 'corr-1',
          causation_id: 'cause-1',
          agent: 'example-echo',
          reactor: 'fixture',
          adapter: 'jira',
          job_id: 'job-1',
          queue: 'example-echo',
          source: 'fixture',
        },
        span,
      ),
    ).toEqual({
      event_id: 'evt-1',
      correlation_id: 'corr-1',
      causation_id: 'cause-1',
      trace_id: '11111111111111111111111111111111',
      span_id: '2222222222222222',
      agent: 'example-echo',
      reactor: 'fixture',
      adapter: 'jira',
      job_id: 'job-1',
      queue: 'example-echo',
      source: 'fixture',
    });
  });

  it('preserves provided trace fields and drops undefined fields', () => {
    expect(
      buildRuntimeLogFields(
        {
          trace_id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          span_id: 'bbbbbbbbbbbbbbbb',
          source: undefined,
        },
        trace.getSpan(context.active()),
      ),
    ).toEqual({
      trace_id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      span_id: 'bbbbbbbbbbbbbbbb',
    });
  });
});
