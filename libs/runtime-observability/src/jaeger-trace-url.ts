const TRACEPARENT_TRACE_ID = /^00-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/;

/** Extracts the 32-char trace id from a W3C `traceparent` header value. */
export function traceIdFromTraceparent(traceparent: string): string {
  const match = TRACEPARENT_TRACE_ID.exec(traceparent.trim());
  if (match === null) {
    throw new Error('Expected W3C traceparent version 00');
  }
  return match[1]!;
}

function normalizeTraceId(traceIdOrTraceparent: string): string {
  const value = traceIdOrTraceparent.trim();
  if (value.includes('-')) {
    return traceIdFromTraceparent(value);
  }
  if (!/^[0-9a-f]{32}$/i.test(value)) {
    throw new Error('Expected a 32-character hex trace id or W3C traceparent');
  }
  return value.toLowerCase();
}

/**
 * Builds a Jaeger UI URL that opens the trace view directly.
 * Accepts either a raw trace id or a W3C `traceparent` value.
 */
export function buildJaegerTraceUrl(
  jaegerUiUrl: string,
  traceIdOrTraceparent: string,
): string {
  const traceId = normalizeTraceId(traceIdOrTraceparent);
  const base = jaegerUiUrl.replace(/\/$/, '');
  return `${base}/trace/${traceId}`;
}
