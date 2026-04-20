import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  initializeObservability,
  type ObservabilityHandle,
} from '../../src/index';

type OtlpExporterCtor =
  typeof import('@opentelemetry/exporter-trace-otlp-http').OTLPTraceExporter & {
    lastConstructorArg?: unknown;
  };

vi.mock('@opentelemetry/exporter-trace-otlp-http', () => {
  class OTLPTraceExporter {
    static lastConstructorArg: unknown;

    constructor(opts: unknown) {
      OTLPTraceExporter.lastConstructorArg = opts;
    }

    export(
      _spans: unknown,
      resultCallback: (r: { code: number }) => void,
    ): void {
      resultCallback({ code: 0 });
    }

    shutdown(): Promise<void> {
      return Promise.resolve();
    }

    forceFlush(): Promise<void> {
      return Promise.resolve();
    }
  }

  return { OTLPTraceExporter };
});

const handles: ObservabilityHandle[] = [];

afterEach(async () => {
  await Promise.all(handles.splice(0).map((handle) => handle.shutdown()));
});

describe('local OTLP wiring', () => {
  beforeEach(async () => {
    const { OTLPTraceExporter } = await import(
      '@opentelemetry/exporter-trace-otlp-http'
    );
    (OTLPTraceExporter as OtlpExporterCtor).lastConstructorArg = undefined;
  });

  it('configures OTLP HTTP trace export in local mode', async () => {
    const { OTLPTraceExporter } = await import(
      '@opentelemetry/exporter-trace-otlp-http'
    );
    const Ctor = OTLPTraceExporter as OtlpExporterCtor;

    const handle = initializeObservability({
      serviceName: 'runtime-observability-otlp-wire-mock',
      mode: 'local',
      registerGlobal: false,
      otlpTraceEndpoint: 'http://127.0.0.1:19999',
    });
    handles.push(handle);

    const span = handle.tracer.startSpan('otlp-wire');
    span.end();
    await handle.forceFlush();

    expect(Ctor.lastConstructorArg).toEqual({
      url: 'http://127.0.0.1:19999/v1/traces',
    });
  });
});
