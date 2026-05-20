import { describe, expect, it } from 'vitest';
import {
  buildJaegerTraceUrl,
  traceIdFromTraceparent,
} from '../../src/jaeger-trace-url.js';

describe('jaeger trace url', () => {
  const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
  const traceparent = `00-${traceId}-00f067aa0ba902b7-01`;

  it('extracts trace id from traceparent', () => {
    expect(traceIdFromTraceparent(traceparent)).toBe(traceId);
  });

  it('builds a direct Jaeger trace URL from traceparent', () => {
    expect(buildJaegerTraceUrl('http://127.0.0.1:26686/', traceparent)).toBe(
      `http://127.0.0.1:26686/trace/${traceId}`,
    );
  });

  it('builds a direct Jaeger trace URL from a raw trace id', () => {
    expect(buildJaegerTraceUrl('http://127.0.0.1:26686', traceId)).toBe(
      `http://127.0.0.1:26686/trace/${traceId}`,
    );
  });
});
