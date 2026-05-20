import {
  type AttributeValue,
  type Context,
  context,
  defaultTextMapGetter,
  defaultTextMapSetter,
  type Meter,
  metrics,
  propagation,
  type Span,
  type SpanAttributes,
  type SpanOptions,
  SpanStatusCode,
  type Tracer,
  trace,
} from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  type ResourceMetrics,
} from '@opentelemetry/sdk-metrics';
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  InMemorySpanExporter,
  type ReadableSpan,
  SimpleSpanProcessor,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import {
  type AgentName,
  type EventCategory,
  type EventType,
  getEventCategory,
  getEventOwner,
  isEventType,
} from 'runtime-events';
import { buildOtlpHttpTracesUrl, resolveLocalOtlpHttpBase } from './otlp-local';

export const RUNTIME_OBSERVABILITY_SCOPE = 'synapse.runtime';
const TRACEPARENT_PATTERN = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

export type ObservabilityMode = 'disabled' | 'local' | 'test';

export type RuntimeHop =
  | 'ingress.emit'
  | 'event.validate'
  | 'event.append'
  | 'bullmq.enqueue'
  | 'bullmq.process'
  | 'reactor.reconcile'
  | 'reactor.run'
  | 'reactor.emit'
  | 'agent_sqlite.open'
  | 'agent.load_fixture'
  | 'adapter.request'
  | 'webhook.request'
  | 'ingress.request'
  | 'poll.tick'
  | 'poll.lock';

export type RuntimeResult =
  | 'success'
  | 'failure'
  | 'deduped'
  | 'retry'
  | 'dropped';

export type RuntimeLogFields = {
  event_id?: string;
  correlation_id?: string;
  causation_id?: string;
  trace_id?: string;
  span_id?: string;
  agent?: AgentName | string;
  reactor?: string;
  adapter?: string;
  job_id?: string;
  queue?: string;
  source?: string;
};

export type RuntimeCommonAttributes = {
  eventId?: string;
  eventType?: EventType | string;
  eventCategory?: EventCategory | string;
  correlationId?: string;
  causationId?: string;
  agent?: AgentName | string;
  reactor?: string;
  adapter?: string;
  jobId?: string;
  queue?: string;
  source?: string;
  topic?: string;
  operation?: string;
  webhookRouteId?: string;
  ingressRouteId?: string;
  pollSourceId?: string;
  result?: RuntimeResult | string;
  replay?: boolean;
};

export type RuntimeMetricLabels = {
  event_type?: string;
  category?: string;
  owner?: string;
  agent?: string;
  reactor?: string;
  adapter?: string;
  operation?: string;
  result?: string;
  queue?: string;
  status?: string;
  replay?: 'true' | 'false';
};

export type ObservabilityOptions = {
  serviceName: string;
  serviceVersion?: string;
  mode?: ObservabilityMode;
  registerGlobal?: boolean;
  metricExportIntervalMillis?: number;
  /**
   * When `mode` is `local`, also export finished spans to the OTLP/HTTP trace
   * endpoint (collector base URL or full `.../v1/traces` URL). Defaults to
   * `process.env.OTEL_EXPORTER_OTLP_ENDPOINT` or the host port published by
   * `local/docker-compose.yml`. Set to `null` for in-process tests so nothing
   * is sent over the network.
   */
  otlpTraceEndpoint?: string | null;
};

export type ObservabilityHandle = {
  mode: ObservabilityMode;
  tracer: Tracer;
  meter: Meter;
  tracerProvider?: BasicTracerProvider;
  meterProvider?: MeterProvider;
  spanExporter?: InMemorySpanExporter;
  metricExporter?: InMemoryMetricExporter;
  metricReader?: PeriodicExportingMetricReader;
  metrics: RuntimeMetrics;
  forceFlush: () => Promise<void>;
  shutdown: () => Promise<void>;
};

export type RuntimeSpanInput = RuntimeCommonAttributes & {
  hop: RuntimeHop;
};

export type RuntimeSpanRunnerInput<T> = RuntimeSpanInput & {
  tracer: Tracer;
  parentContext?: Context;
  options?: SpanOptions;
  run: (span: Span, spanContext: Context) => T | Promise<T>;
};

export type RuntimeSpanAuditContext = {
  traceId: string;
  spanId: string;
};

const spanNames = {
  'ingress.emit': 'ingress emit',
  'event.validate': 'event validate',
  'event.append': 'event append',
  'bullmq.enqueue': 'bullmq enqueue',
  'bullmq.process': 'bullmq process',
  'reactor.reconcile': 'reactor reconcile',
  'reactor.run': 'reactor run',
  'reactor.emit': 'reactor emit',
  'agent_sqlite.open': 'agent sqlite open',
  'agent.load_fixture': 'agent load fixture',
  'adapter.request': 'adapter request',
  'webhook.request': 'webhook request',
  'ingress.request': 'ingress request',
  'poll.tick': 'poll tick',
  'poll.lock': 'poll lock',
} as const satisfies Record<RuntimeHop, string>;

const highCardinalityMetricKeys = new Set([
  'event_id',
  'correlation_id',
  'causation_id',
  'trace_id',
  'span_id',
  'job_id',
  'source',
  'subject',
  'external_id',
  'request_id',
  'artifact_id',
  'synapse.event.id',
  'synapse.trace.id',
  'synapse.span.id',
  'synapse.job.id',
  'synapse.correlation.id',
  'synapse.causation.id',
  'synapse.source',
]);

const traceContextPropagator = new W3CTraceContextPropagator();

/** Avoid replacing OpenTelemetry globals on repeated process-level initialization. */
let installedGlobalPropagationAndContext = false;
let installedGlobalTracerAndMeterProviders = false;

export function initializeObservability(
  options: ObservabilityOptions,
): ObservabilityHandle {
  const mode = options.mode ?? 'local';
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: options.serviceName,
    ...(options.serviceVersion === undefined
      ? {}
      : { [ATTR_SERVICE_VERSION]: options.serviceVersion }),
  });

  const registerGlobals = options.registerGlobal !== false;
  if (registerGlobals && !installedGlobalPropagationAndContext) {
    propagation.setGlobalPropagator(traceContextPropagator);
    context.setGlobalContextManager(
      new AsyncLocalStorageContextManager().enable(),
    );
    installedGlobalPropagationAndContext = true;
  }

  if (mode === 'disabled') {
    const tracer = trace.getTracer(RUNTIME_OBSERVABILITY_SCOPE);
    const meter = metrics.getMeter(RUNTIME_OBSERVABILITY_SCOPE);
    return {
      mode,
      tracer,
      meter,
      metrics: createRuntimeMetrics(meter),
      forceFlush: async () => {},
      shutdown: async () => {},
    };
  }

  const spanExporter = new InMemorySpanExporter();
  const spanProcessors: SpanProcessor[] = [
    new SimpleSpanProcessor(spanExporter),
  ];

  if (mode === 'local') {
    const otlpBase = resolveLocalOtlpHttpBase(options);
    if (otlpBase !== null) {
      spanProcessors.push(
        new BatchSpanProcessor(
          new OTLPTraceExporter({
            url: buildOtlpHttpTracesUrl(otlpBase),
          }),
          { scheduledDelayMillis: 500 },
        ),
      );
    }
  }

  const tracerProvider = new BasicTracerProvider({
    resource,
    spanProcessors,
  });
  const tracer = tracerProvider.getTracer(RUNTIME_OBSERVABILITY_SCOPE);

  const metricExporter = new InMemoryMetricExporter(
    AggregationTemporality.CUMULATIVE,
  );
  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: options.metricExportIntervalMillis ?? 60_000,
  });
  const meterProvider = new MeterProvider({
    resource,
    readers: [metricReader],
  });
  const meter = meterProvider.getMeter(RUNTIME_OBSERVABILITY_SCOPE);

  if (registerGlobals && !installedGlobalTracerAndMeterProviders) {
    trace.setGlobalTracerProvider(tracerProvider);
    metrics.setGlobalMeterProvider(meterProvider);
    installedGlobalTracerAndMeterProviders = true;
  }

  return {
    mode,
    tracer,
    meter,
    tracerProvider,
    meterProvider,
    spanExporter,
    metricExporter,
    metricReader,
    metrics: createRuntimeMetrics(meter),
    forceFlush: async () => {
      await tracerProvider.forceFlush();
      await meterProvider.forceFlush();
    },
    shutdown: async () => {
      await tracerProvider.shutdown();
      await meterProvider.shutdown();
    },
  };
}

export function extractTraceContext(
  carrier: Record<string, string | undefined>,
): Context {
  const normalizedCarrier = removeUndefined({
    traceparent: carrier.traceparent ?? carrier.traceParent,
    tracestate: carrier.tracestate ?? carrier.traceState,
  });
  if (Object.keys(normalizedCarrier).length === 0) {
    return context.active();
  }
  validateTraceCarrier(normalizedCarrier);
  return traceContextPropagator.extract(
    context.active(),
    normalizedCarrier,
    defaultTextMapGetter,
  );
}

export function injectTraceContext(
  inputContext: Context,
): Record<string, string> {
  const carrier: Record<string, string> = {};
  traceContextPropagator.inject(inputContext, carrier, defaultTextMapSetter);
  return carrier;
}

export function contextFromTraceCarrier(
  carrier: Record<string, string | undefined>,
): Context {
  return extractTraceContext(carrier);
}

export function contextFromEvent(event: {
  traceparent?: string;
  tracestate?: string;
}): Context {
  const carrier = removeUndefined({
    traceparent: event.traceparent,
    tracestate: event.tracestate,
  });
  if (Object.keys(carrier).length === 0) {
    return context.active();
  }
  return extractTraceContext(carrier);
}

export function eventTraceCarrier(inputContext: Context): {
  traceparent?: string;
  tracestate?: string;
} {
  const carrier = injectTraceContext(inputContext);
  return removeUndefined({
    traceparent: carrier.traceparent,
    tracestate: carrier.tracestate,
  });
}

function validateTraceCarrier(carrier: {
  traceparent?: string;
  tracestate?: string;
}): void {
  if (carrier.tracestate !== undefined && carrier.traceparent === undefined) {
    throw new Error('tracestate requires traceparent');
  }
  if (
    carrier.tracestate !== undefined &&
    (carrier.tracestate.length > 512 || /[\r\n]/.test(carrier.tracestate))
  ) {
    throw new Error('tracestate must be a single header line');
  }
  if (carrier.traceparent === undefined) {
    return;
  }
  if (!TRACEPARENT_PATTERN.test(carrier.traceparent)) {
    throw new Error('Expected W3C traceparent version 00');
  }
  const [, traceId, spanId] = carrier.traceparent.split('-');
  if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) {
    throw new Error('traceparent trace ID and span ID must be non-zero');
  }
}

export function runtimeSpanName(hop: RuntimeHop): string {
  return spanNames[hop];
}

function ingressHttpAttributes(
  input: RuntimeSpanInput,
): Record<string, AttributeValue | undefined> {
  if (
    (input.hop !== 'webhook.request' && input.hop !== 'ingress.request') ||
    input.operation === undefined
  ) {
    return {};
  }
  const space = input.operation.indexOf(' ');
  if (space <= 0) {
    return {};
  }
  return {
    'http.request.method': input.operation.slice(0, space),
    'http.route': input.operation.slice(space + 1),
  };
}

export function buildRuntimeSpanAttributes(
  input: RuntimeSpanInput,
): SpanAttributes {
  return compactAttributes({
    'synapse.runtime.hop': input.hop,
    'synapse.event.id': input.eventId,
    'synapse.event.type': input.eventType,
    'synapse.event.category':
      input.eventCategory ?? eventCategoryFor(input.eventType),
    'synapse.correlation.id': input.correlationId,
    'synapse.causation.id': input.causationId,
    'synapse.agent': input.agent,
    'synapse.reactor': input.reactor,
    'synapse.adapter': input.adapter,
    'synapse.job.id': input.jobId,
    'synapse.queue': input.queue,
    'synapse.source': input.source,
    'messaging.destination.name': input.topic ?? input.queue,
    'synapse.operation': input.operation,
    'synapse.webhook.route_id': input.webhookRouteId,
    'synapse.ingress.route_id': input.ingressRouteId,
    'synapse.poll.source_id': input.pollSourceId,
    'synapse.result': input.result,
    'synapse.replay': input.replay,
    ...ingressHttpAttributes(input),
  });
}

export async function runWithRuntimeSpan<T>(
  input: RuntimeSpanRunnerInput<T>,
): Promise<T> {
  const parentContext = input.parentContext ?? context.active();
  const span = input.tracer.startSpan(
    runtimeSpanName(input.hop),
    {
      ...input.options,
      attributes: {
        ...buildRuntimeSpanAttributes(input),
        ...input.options?.attributes,
      },
    },
    parentContext,
  );
  const spanContext = trace.setSpan(parentContext, span);

  try {
    const result = await context.with(spanContext, () =>
      input.run(span, spanContext),
    );
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message });
    if (error instanceof Error) {
      span.recordException(error);
    } else {
      span.recordException(new Error(message));
    }
    throw error;
  } finally {
    span.end();
  }
}

export function runtimeSpanAuditContext(
  span: Span | undefined = trace.getActiveSpan(),
): RuntimeSpanAuditContext | undefined {
  const spanContext = span?.spanContext();
  if (spanContext === undefined) {
    return undefined;
  }
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
  };
}

export function buildRuntimeLogFields(
  fields: RuntimeLogFields,
  span: Span | undefined = trace.getActiveSpan(),
): RuntimeLogFields {
  const spanContext = span?.spanContext();
  return removeUndefined({
    ...fields,
    trace_id: fields.trace_id ?? spanContext?.traceId,
    span_id: fields.span_id ?? spanContext?.spanId,
  }) as RuntimeLogFields;
}

export class RuntimeMetrics {
  private readonly eventsRecorded;
  private readonly outboxOperations;
  private readonly bullmqJobs;
  private readonly adapterRequests;
  private readonly agentRuns;
  private readonly pollTicks;
  private readonly pollEmits;
  private readonly pollSkips;

  constructor(meter: Meter) {
    this.eventsRecorded = meter.createCounter('synapse.events.recorded', {
      description: 'Events accepted by the runtime boundary.',
    });
    this.outboxOperations = meter.createCounter('synapse.outbox.operations', {
      description: 'Outbox enqueue, claim, publish, and retry operations.',
    });
    this.bullmqJobs = meter.createCounter('synapse.bullmq.jobs', {
      description: 'BullMQ enqueue and process operations.',
    });
    this.adapterRequests = meter.createCounter('synapse.adapter.requests', {
      description: 'External adapter requests (low-cardinality labels only).',
    });
    this.agentRuns = meter.createCounter('synapse.agent.runs', {
      description: 'Agent run outcomes.',
    });
    this.pollTicks = meter.createCounter('synapse.poll.ticks', {
      description: 'Poll source tick outcomes.',
    });
    this.pollEmits = meter.createCounter('synapse.poll.emits', {
      description: 'Events emitted from poll ingress.',
    });
    this.pollSkips = meter.createCounter('synapse.poll.skips', {
      description: 'Poll ingress skip reasons.',
    });
  }

  recordEvent(labels: RuntimeMetricLabels, count = 1): void {
    this.eventsRecorded.add(count, buildEventMetricLabels(labels));
  }

  recordOutbox(labels: RuntimeMetricLabels, count = 1): void {
    this.outboxOperations.add(count, buildOutboxMetricLabels(labels));
  }

  recordBullmq(labels: RuntimeMetricLabels, count = 1): void {
    this.bullmqJobs.add(count, buildBullmqMetricLabels(labels));
  }

  recordAdapter(labels: RuntimeMetricLabels, count = 1): void {
    this.adapterRequests.add(count, buildAdapterMetricLabels(labels));
  }

  recordAgentRun(labels: RuntimeMetricLabels, count = 1): void {
    this.agentRuns.add(count, buildAgentRunMetricLabels(labels));
  }

  recordPollTick(
    labels: { source_id: string; outcome: string },
    count = 1,
  ): void {
    this.pollTicks.add(
      count,
      lowCardinalityLabels({
        source_id: labels.source_id,
        outcome: labels.outcome,
      }),
    );
  }

  recordPollEmit(labels: { source_id: string }, count = 1): void {
    this.pollEmits.add(
      count,
      lowCardinalityLabels({ source_id: labels.source_id }),
    );
  }

  recordPollSkip(
    labels: { source_id: string; reason: string },
    count = 1,
  ): void {
    this.pollSkips.add(
      count,
      lowCardinalityLabels({
        source_id: labels.source_id,
        reason: labels.reason,
      }),
    );
  }
}

export function createRuntimeMetrics(meter: Meter): RuntimeMetrics {
  return new RuntimeMetrics(meter);
}

export function buildEventMetricLabels(
  labels: RuntimeMetricLabels,
): SpanAttributes {
  const eventType = labels.event_type;
  return lowCardinalityLabels({
    event_type: eventType,
    category: labels.category ?? eventCategoryFor(eventType),
    owner: labels.owner ?? eventOwnerFor(eventType),
    result: labels.result,
  });
}

export function buildOutboxMetricLabels(
  labels: RuntimeMetricLabels,
): SpanAttributes {
  return lowCardinalityLabels({
    operation: labels.operation,
    result: labels.result,
  });
}

export function buildBullmqMetricLabels(
  labels: RuntimeMetricLabels,
): SpanAttributes {
  return lowCardinalityLabels({
    operation: labels.operation,
    queue: labels.queue,
    agent: labels.agent,
    result: labels.result,
  });
}

export function buildAdapterMetricLabels(
  labels: RuntimeMetricLabels,
): SpanAttributes {
  return lowCardinalityLabels({
    adapter: labels.adapter,
    operation: labels.operation,
    result: labels.result,
  });
}

export function buildAgentRunMetricLabels(
  labels: RuntimeMetricLabels,
): SpanAttributes {
  return lowCardinalityLabels({
    agent: labels.agent,
    status: labels.status,
    replay: labels.replay,
  });
}

export function assertLowCardinalityMetricLabels(
  labels: SpanAttributes,
): SpanAttributes {
  for (const key of Object.keys(labels)) {
    if (highCardinalityMetricKeys.has(key)) {
      throw new Error(`High-cardinality metric label is not allowed: ${key}`);
    }
  }
  return labels;
}

export function resetTestExporters(handle: ObservabilityHandle): void {
  handle.spanExporter?.reset();
  handle.metricExporter?.reset();
}

export function getFinishedSpans(handle: ObservabilityHandle): ReadableSpan[] {
  return handle.spanExporter?.getFinishedSpans() ?? [];
}

export async function getExportedMetrics(
  handle: ObservabilityHandle,
): Promise<ResourceMetrics[]> {
  await handle.meterProvider?.forceFlush();
  return handle.metricExporter?.getMetrics() ?? [];
}

function compactAttributes(
  attributes: Record<string, AttributeValue | undefined>,
): SpanAttributes {
  return removeUndefined(attributes);
}

function lowCardinalityLabels(
  labels: Record<string, AttributeValue | undefined>,
): SpanAttributes {
  return assertLowCardinalityMetricLabels(removeUndefined(labels));
}

function eventCategoryFor(
  eventType: string | undefined,
): EventCategory | undefined {
  return eventType !== undefined && isEventType(eventType)
    ? getEventCategory(eventType)
    : undefined;
}

function eventOwnerFor(eventType: string | undefined): AgentName | undefined {
  return eventType !== undefined && isEventType(eventType)
    ? getEventOwner(eventType)
    : undefined;
}

function removeUndefined<TValue extends AttributeValue | string | undefined>(
  input: Record<string, TValue>,
): Record<string, Exclude<TValue, undefined>> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Record<string, Exclude<TValue, undefined>>;
}

export {
  buildJaegerTraceUrl,
  traceIdFromTraceparent,
} from './jaeger-trace-url.js';
