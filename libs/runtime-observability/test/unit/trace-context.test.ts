import {
  context,
  ROOT_CONTEXT,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { afterEach, describe, expect, it } from 'vitest';
import {
  contextFromEvent,
  contextFromTraceCarrier,
  eventTraceCarrier,
  extractTraceContext,
  getFinishedSpans,
  initializeObservability,
  injectTraceContext,
  type ObservabilityHandle,
  resetTestExporters,
  runWithRuntimeSpan,
} from '../../src/index';

const handles: ObservabilityHandle[] = [];

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.shutdown()));
});

function createHandle(): ObservabilityHandle {
  const handle = initializeObservability({
    serviceName: 'runtime-observability-test',
    serviceVersion: '0.0.0',
    mode: 'test',
    registerGlobal: false,
  });
  handles.push(handle);
  return handle;
}

describe('trace context helpers', () => {
  it('injects and extracts W3C trace context', async () => {
    const handle = createHandle();
    const parent = handle.tracer.startSpan('parent');
    const parentContext = trace.setSpan(context.active(), parent);

    const carrier = injectTraceContext(parentContext);
    const extracted = extractTraceContext(carrier);
    const extractedSpanContext = trace.getSpanContext(extracted);

    expect(carrier.traceparent).toMatch(
      /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/,
    );
    expect(extractedSpanContext?.traceId).toBe(parent.spanContext().traceId);

    parent.end();
    await handle.forceFlush();
    expect(getFinishedSpans(handle)).toHaveLength(1);
  });

  it('accepts camel-case carrier aliases and event carriers', () => {
    const handle = createHandle();
    const span = handle.tracer.startSpan('carrier-source');
    const carrier = injectTraceContext(trace.setSpan(context.active(), span));
    const camelCaseContext = contextFromTraceCarrier({
      traceParent: carrier.traceparent,
      traceState: carrier.tracestate,
    });
    const eventContext = contextFromEvent({
      traceparent: carrier.traceparent,
      tracestate: carrier.tracestate,
    });

    expect(trace.getSpanContext(camelCaseContext)?.traceId).toBe(
      span.spanContext().traceId,
    );
    expect(eventTraceCarrier(eventContext).traceparent).toBe(
      carrier.traceparent,
    );
    span.end();
  });

  it('rejects invalid trace context before extraction', () => {
    expect(() =>
      extractTraceContext({
        traceparent: '00-00000000000000000000000000000000-0000000000000000-01',
      }),
    ).toThrow(/trace ID and span ID/);
  });

  it('treats empty carriers and events without trace headers as active context', () => {
    context.with(ROOT_CONTEXT, () => {
      expect(extractTraceContext({})).toBe(context.active());
      expect(contextFromTraceCarrier({})).toBe(context.active());
      expect(
        contextFromEvent({
          traceparent: undefined,
          tracestate: undefined,
        }),
      ).toBe(context.active());
      expect(eventTraceCarrier(contextFromTraceCarrier({}))).toEqual({});
    });
  });

  it('runs child spans under an extracted parent trace', async () => {
    const handle = createHandle();
    const parent = handle.tracer.startSpan('event append');
    const parentContext = trace.setSpan(context.active(), parent);
    const parentCarrier = injectTraceContext(parentContext);

    await runWithRuntimeSpan({
      tracer: handle.tracer,
      hop: 'reactor.emit',
      eventId: 'evt-child',
      eventType: 'enrichment.produced.v1',
      parentContext: extractTraceContext(parentCarrier),
      run: (span, spanContext) => {
        expect(span.spanContext().traceId).toBe(parent.spanContext().traceId);
        expect(trace.getSpan(spanContext)?.spanContext().spanId).toBe(
          span.spanContext().spanId,
        );
      },
    });

    parent.end();
    await handle.forceFlush();

    const spans = getFinishedSpans(handle);
    expect(spans.map((span) => span.name).sort()).toEqual([
      'event append',
      'reactor emit',
    ]);
    expect(new Set(spans.map((span) => span.spanContext().traceId)).size).toBe(
      1,
    );
  });

  it('records exceptions and always ends runtime spans', async () => {
    const handle = createHandle();

    await expect(
      runWithRuntimeSpan({
        tracer: handle.tracer,
        hop: 'adapter.request',
        adapter: 'jira',
        run: () => {
          throw new Error('adapter unavailable');
        },
      }),
    ).rejects.toThrow('adapter unavailable');

    await handle.forceFlush();
    const [span] = getFinishedSpans(handle);
    expect(span.name).toBe('adapter request');
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.events[0]?.name).toBe('exception');
  });

  it('marks successful runtime spans as OK', async () => {
    const handle = createHandle();
    await runWithRuntimeSpan({
      tracer: handle.tracer,
      hop: 'event.validate',
      run: () => {},
    });
    await handle.forceFlush();
    const [span] = getFinishedSpans(handle);
    expect(span.status.code).toBe(SpanStatusCode.OK);
  });

  it('records non-Error throws as exceptions on the span', async () => {
    const handle = createHandle();
    await expect(
      runWithRuntimeSpan({
        tracer: handle.tracer,
        hop: 'reactor.run',
        run: () => {
          throw 'not-an-error-instance';
        },
      }),
    ).rejects.toBe('not-an-error-instance');

    await handle.forceFlush();
    const [span] = getFinishedSpans(handle);
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.events[0]?.name).toBe('exception');
  });

  it('resets local test exporters', async () => {
    const handle = createHandle();
    await runWithRuntimeSpan({
      tracer: handle.tracer,
      hop: 'ingress.emit',
      run: () => {},
    });
    await handle.forceFlush();
    expect(getFinishedSpans(handle)).toHaveLength(1);

    resetTestExporters(handle);
    expect(getFinishedSpans(handle)).toHaveLength(0);
  });
});
