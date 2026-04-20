/** Default `OTEL_EXPORTER_OTLP_ENDPOINT` for `local/docker-compose.yml` (HTTP on host 24318). */
export const DEFAULT_LOCAL_OTLP_HTTP_BASE = 'http://127.0.0.1:24318';

export function buildOtlpHttpTracesUrl(endpointOrBase: string): string {
  const trimmed = endpointOrBase.trim().replace(/\/$/, '');
  if (trimmed.endsWith('/v1/traces')) {
    return trimmed;
  }
  return `${trimmed}/v1/traces`;
}

export type OtlpTraceEndpointField = {
  otlpTraceEndpoint?: string | null;
};

export function resolveLocalOtlpHttpBase(
  options: OtlpTraceEndpointField,
): string | null {
  if (options.otlpTraceEndpoint === null) {
    return null;
  }
  if (options.otlpTraceEndpoint !== undefined) {
    const trimmed = options.otlpTraceEndpoint.trim();
    return trimmed === '' ? null : trimmed;
  }
  const fromEnv = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_LOCAL_OTLP_HTTP_BASE;
}
