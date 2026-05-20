import {
  type AdapterErrorBody,
  assertJsonSerializable,
} from 'runtime-adapters';
import { z } from 'zod';

import type { AdapterHttpStatus } from './adapter-http-errors.js';

const invokeBodySchema = z
  .object({
    params: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type ParsedAdapterInvokeRequest = {
  params: Record<string, unknown>;
};

export type ParseAdapterRequestFailure = {
  status: AdapterHttpStatus;
  error: AdapterErrorBody['error'];
};

export function normalizeAdapterParams(
  params: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return params ?? {};
}

export async function parseAdapterInvokeRequest(input: {
  rawBody: string;
  maxBodyBytes: number;
  source: string;
  method: string;
}): Promise<
  | { ok: true; value: ParsedAdapterInvokeRequest }
  | { ok: false; failure: ParseAdapterRequestFailure }
> {
  if (Buffer.byteLength(input.rawBody, 'utf8') > input.maxBodyBytes) {
    return {
      ok: false,
      failure: {
        status: 413,
        error: {
          code: 'adapter_request_invalid',
          message: 'Request body exceeds maximum size',
          source: input.source,
          method: input.method,
        },
      },
    };
  }

  let bodyJson: unknown;
  try {
    bodyJson =
      input.rawBody === '' ? {} : (JSON.parse(input.rawBody) as unknown);
  } catch {
    return {
      ok: false,
      failure: {
        status: 400,
        error: {
          code: 'adapter_body_invalid_json',
          message: 'Request body is not valid JSON',
          source: input.source,
          method: input.method,
        },
      },
    };
  }

  const bodyParsed = invokeBodySchema.safeParse(bodyJson);
  if (!bodyParsed.success) {
    return {
      ok: false,
      failure: {
        status: 400,
        error: {
          code: 'adapter_request_invalid',
          message: 'Invalid invoke request body shape',
          source: input.source,
          method: input.method,
          fieldPath: 'body',
        },
      },
    };
  }

  const params = normalizeAdapterParams(bodyParsed.data.params);
  try {
    assertJsonSerializable(params, 'params');
  } catch (error) {
    const fieldPath =
      error instanceof Error && 'fieldPath' in error
        ? String((error as { fieldPath: string }).fieldPath)
        : 'params';
    const valueKind =
      error instanceof Error && 'valueKind' in error
        ? String((error as { valueKind: string }).valueKind)
        : 'unknown';
    return {
      ok: false,
      failure: {
        status: 400,
        error: {
          code: 'adapter_params_not_serializable',
          message: `Adapter params for ${input.source}.${input.method} are not JSON-serializable: ${fieldPath} is ${valueKind}.`,
          source: input.source,
          method: input.method,
          fieldPath,
          valueKind,
          callerAction:
            'Fix the agent handler that built these params before calling invokeAdapter.',
        },
      },
    };
  }

  return { ok: true, value: { params } };
}
