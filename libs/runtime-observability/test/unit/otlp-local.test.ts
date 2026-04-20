import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildOtlpHttpTracesUrl,
  DEFAULT_LOCAL_OTLP_HTTP_BASE,
  resolveLocalOtlpHttpBase,
} from '../../src/otlp-local';

describe('buildOtlpHttpTracesUrl', () => {
  it('appends /v1/traces to a base URL', () => {
    expect(buildOtlpHttpTracesUrl('http://127.0.0.1:24318')).toBe(
      'http://127.0.0.1:24318/v1/traces',
    );
  });

  it('strips a trailing slash before appending', () => {
    expect(buildOtlpHttpTracesUrl('http://127.0.0.1:24318/')).toBe(
      'http://127.0.0.1:24318/v1/traces',
    );
  });

  it('leaves a full trace URL unchanged', () => {
    expect(buildOtlpHttpTracesUrl('http://127.0.0.1:24318/v1/traces')).toBe(
      'http://127.0.0.1:24318/v1/traces',
    );
  });

  it('trims whitespace', () => {
    expect(buildOtlpHttpTracesUrl('  http://h:9/  ')).toBe(
      'http://h:9/v1/traces',
    );
  });
});

describe('resolveLocalOtlpHttpBase', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null when otlpTraceEndpoint is null', () => {
    expect(resolveLocalOtlpHttpBase({ otlpTraceEndpoint: null })).toBeNull();
  });

  it('returns null when otlpTraceEndpoint is whitespace only', () => {
    expect(resolveLocalOtlpHttpBase({ otlpTraceEndpoint: '  ' })).toBeNull();
  });

  it('returns trimmed explicit endpoint', () => {
    expect(
      resolveLocalOtlpHttpBase({
        otlpTraceEndpoint: ' http://custom:4318 ',
      }),
    ).toBe('http://custom:4318');
  });

  it('uses OTEL_EXPORTER_OTLP_ENDPOINT when unset in options', () => {
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://from-env:9');
    expect(resolveLocalOtlpHttpBase({})).toBe('http://from-env:9');
  });

  it('prefers explicit option over env', () => {
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://from-env:9');
    expect(
      resolveLocalOtlpHttpBase({ otlpTraceEndpoint: 'http://explicit:1' }),
    ).toBe('http://explicit:1');
  });

  it('falls back to compose default when env is empty', () => {
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', '');
    expect(resolveLocalOtlpHttpBase({})).toBe(DEFAULT_LOCAL_OTLP_HTTP_BASE);
  });

  it('falls back when env is unset', () => {
    expect(resolveLocalOtlpHttpBase({})).toBe(DEFAULT_LOCAL_OTLP_HTTP_BASE);
  });
});
