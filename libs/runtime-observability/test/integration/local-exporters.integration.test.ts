import { context, trace } from '@opentelemetry/api';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getExportedMetrics,
  getFinishedSpans,
  initializeObservability,
  injectTraceContext,
  type ObservabilityHandle,
  runWithRuntimeSpan,
} from '../../src/index';

const handles: ObservabilityHandle[] = [];

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.shutdown()));
});

function createLocalHandle(): ObservabilityHandle {
  const handle = initializeObservability({
    serviceName: 'runtime-observability-local-fixture',
    mode: 'local',
    registerGlobal: false,
    otlpTraceEndpoint: null,
  });
  handles.push(handle);
  return handle;
}

describe('local fixture observability', () => {
  it('exports spans and metrics without a remote observability service', async () => {
    const handle = createLocalHandle();

    await runWithRuntimeSpan({
      tracer: handle.tracer,
      hop: 'ingress.emit',
      eventId: 'evt-local',
      eventType: 'example.ping.v1',
      run: (span, spanContext) => {
        const carrier = injectTraceContext(spanContext);
        handle.metrics.recordEvent({
          event_type: 'example.ping.v1',
          result: 'success',
        });

        expect(carrier.traceparent).toContain(span.spanContext().traceId);
      },
    });

    await handle.forceFlush();

    expect(getFinishedSpans(handle).map((span) => span.name)).toEqual([
      'ingress emit',
    ]);
    expect(await getExportedMetrics(handle)).not.toHaveLength(0);
  });

  it('can opt into globals through the shared initializer', async () => {
    const handle = initializeObservability({
      serviceName: 'runtime-observability-global-fixture',
      mode: 'test',
    });
    handles.push(handle);

    const span = handle.tracer.startSpan('global parent');
    const spanContext = trace.setSpan(context.active(), span);

    expect(injectTraceContext(spanContext).traceparent).toContain(
      span.spanContext().traceId,
    );

    span.end();
    await handle.forceFlush();
    expect(getFinishedSpans(handle)[0]?.name).toBe('global parent');
  });

  it('can be disabled while keeping no-op handles safe', async () => {
    const handle = initializeObservability({
      serviceName: 'runtime-observability-disabled',
      mode: 'disabled',
      registerGlobal: false,
    });

    expect(handle.mode).toBe('disabled');
    expect(getFinishedSpans(handle)).toEqual([]);
    expect(await getExportedMetrics(handle)).toEqual([]);
    await expect(handle.forceFlush()).resolves.toBeUndefined();
    await expect(handle.shutdown()).resolves.toBeUndefined();
  });

  it('does not throw when initializeObservability registers globals twice', async () => {
    const first = initializeObservability({
      serviceName: 'runtime-observability-global-repeat-a',
      mode: 'test',
    });
    handles.push(first);

    const second = initializeObservability({
      serviceName: 'runtime-observability-global-repeat-b',
      mode: 'test',
    });
    handles.push(second);

    await runWithRuntimeSpan({
      tracer: first.tracer,
      hop: 'ingress.emit',
      run: () => {},
    });
    await first.forceFlush();
    expect(getFinishedSpans(first)).toHaveLength(1);

    await runWithRuntimeSpan({
      tracer: second.tracer,
      hop: 'event.append',
      run: () => {},
    });
    await second.forceFlush();
    expect(getFinishedSpans(second).map((s) => s.name)).toContain(
      'event append',
    );
  });

  it('defaults runtime processes to local mode', async () => {
    const handle = initializeObservability({
      serviceName: 'runtime-observability-default-local',
      registerGlobal: false,
      otlpTraceEndpoint: null,
    });
    handles.push(handle);

    expect(handle.mode).toBe('local');
  });
});
