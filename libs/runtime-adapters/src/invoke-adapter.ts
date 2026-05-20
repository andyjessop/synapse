import {
  AdapterParamsNotSerializableError,
  assertJsonSerializable,
} from './assert-json-serializable.js';
import {
  formatNotSerializableError,
  formatZodParamsError,
} from './format-adapter-error.js';
import type { AdapterInvokeInput, AdapterPort } from './types.js';

export class AdapterInvokeError extends Error {
  readonly code: string;
  readonly details: import('./types.js').AdapterErrorBody['error'];

  constructor(
    details: import('./types.js').AdapterErrorBody['error'],
    options?: { cause?: unknown },
  ) {
    super(details.message);
    this.name = 'AdapterInvokeError';
    this.code = details.code;
    this.details = details;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

function normalizeParams(
  params: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return params ?? {};
}

export async function invokeAdapter(
  port: AdapterPort,
  input: AdapterInvokeInput,
): Promise<unknown> {
  if (input.agentName.trim() === '') {
    throw new AdapterInvokeError({
      code: 'adapter_request_invalid',
      message: 'invokeAdapter requires agentName',
      source: input.source,
      method: input.method,
      agentName: input.agentName,
      fieldPath: 'agentName',
      callerAction:
        'Pass ctx.agentName from the agent handler when calling invokeAdapter.',
    });
  }

  const params = normalizeParams(input.params);
  try {
    assertJsonSerializable(params, 'params');
  } catch (error) {
    if (error instanceof AdapterParamsNotSerializableError) {
      throw new AdapterInvokeError(
        formatNotSerializableError(input, error.fieldPath, error.valueKind),
        { cause: error },
      );
    }
    throw error;
  }

  return port.invoke({ ...input, params });
}

export { formatZodParamsError };
