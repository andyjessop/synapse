import type { ZodIssue } from 'zod';

import type { AdapterErrorBody, AdapterInvokeInput } from './types.js';

export function formatAdapterParamError(input: {
  code: string;
  message: string;
  source: string;
  method: string;
  agentName: string;
  fieldPath: string;
  valueKind?: string;
  hint?: string;
  zodIssue?: string;
}): AdapterErrorBody['error'] {
  return {
    code: input.code,
    message: input.message,
    source: input.source,
    method: input.method,
    agentName: input.agentName,
    fieldPath: input.fieldPath,
    ...(input.valueKind !== undefined ? { valueKind: input.valueKind } : {}),
    ...(input.hint !== undefined ? { hint: input.hint } : {}),
    ...(input.zodIssue !== undefined ? { zodIssue: input.zodIssue } : {}),
    callerAction:
      'Fix the agent handler that built these params before calling invokeAdapter.',
  };
}

export function formatNotSerializableError(
  invoke: Pick<AdapterInvokeInput, 'source' | 'method' | 'agentName'>,
  fieldPath: string,
  valueKind: string,
): AdapterErrorBody['error'] {
  const hint =
    valueKind === 'undefined'
      ? 'Omit the key or set null. undefined is stripped by JSON and breaks scenario fixture matching.'
      : `Convert ${fieldPath} to a JSON-safe value before invoke.`;
  return formatAdapterParamError({
    code: 'adapter_params_not_serializable',
    message: `Adapter params for ${invoke.source}.${invoke.method} are not JSON-serializable: ${fieldPath} is ${valueKind}. Adapter RPC accepts JSON-safe data only (string, number, boolean, null, plain objects, arrays). Omit optional fields or use null.`,
    source: invoke.source,
    method: invoke.method,
    agentName: invoke.agentName,
    fieldPath,
    valueKind,
    hint,
  });
}

export function formatZodParamsError(
  invoke: Pick<AdapterInvokeInput, 'source' | 'method' | 'agentName'>,
  issues: ZodIssue[],
): AdapterErrorBody['error'] {
  const issue = issues[0]!;
  const fieldPath = ['params', ...issue.path.map(String)].join('.');
  return formatAdapterParamError({
    code: 'adapter_params_invalid',
    message: `Invalid params for ${invoke.source}.${invoke.method}: ${fieldPath} ${issue.message}.`,
    source: invoke.source,
    method: invoke.method,
    agentName: invoke.agentName,
    fieldPath,
    zodIssue: issue.code,
    hint: 'Pass params matching the adapter method contract.',
  });
}
