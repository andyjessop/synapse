export type JsonValueKind =
  | 'undefined'
  | 'bigint'
  | 'function'
  | 'symbol'
  | 'date'
  | 'unsupported_object'
  | 'circular'
  | 'class_instance'
  | 'nan'
  | 'infinity';

export class AdapterParamsNotSerializableError extends Error {
  readonly code = 'adapter_params_not_serializable' as const;
  readonly fieldPath: string;
  readonly valueKind: JsonValueKind;

  constructor(fieldPath: string, valueKind: JsonValueKind) {
    super(`Value at ${fieldPath} is not JSON-serializable (${valueKind})`);
    this.name = 'AdapterParamsNotSerializableError';
    this.fieldPath = fieldPath;
    this.valueKind = valueKind;
  }
}

export function assertJsonSerializable(
  value: unknown,
  path: string,
  seen = new WeakSet<object>(),
): void {
  if (value === undefined) {
    throw new AdapterParamsNotSerializableError(path, 'undefined');
  }
  if (value === null) {
    return;
  }
  const valueType = typeof value;
  if (valueType === 'bigint') {
    throw new AdapterParamsNotSerializableError(path, 'bigint');
  }
  if (valueType === 'function') {
    throw new AdapterParamsNotSerializableError(path, 'function');
  }
  if (valueType === 'symbol') {
    throw new AdapterParamsNotSerializableError(path, 'symbol');
  }
  if (valueType === 'number') {
    if (Number.isNaN(value as number)) {
      throw new AdapterParamsNotSerializableError(path, 'nan');
    }
    if (!Number.isFinite(value as number)) {
      throw new AdapterParamsNotSerializableError(path, 'infinity');
    }
    return;
  }
  if (valueType === 'string' || valueType === 'boolean') {
    return;
  }
  if (value instanceof Date) {
    throw new AdapterParamsNotSerializableError(path, 'date');
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      assertJsonSerializable(value[i], `${path}[${i}]`, seen);
    }
    return;
  }
  if (valueType === 'object') {
    const objectValue = value as object;
    if (seen.has(objectValue)) {
      throw new AdapterParamsNotSerializableError(path, 'circular');
    }
    seen.add(objectValue);
    const proto = Object.getPrototypeOf(objectValue);
    if (proto !== null && proto !== Object.prototype) {
      throw new AdapterParamsNotSerializableError(path, 'class_instance');
    }
    if (value instanceof Map || value instanceof Set) {
      throw new AdapterParamsNotSerializableError(path, 'unsupported_object');
    }
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      assertJsonSerializable(record[key], `${path}.${key}`, seen);
    }
    return;
  }
  throw new AdapterParamsNotSerializableError(path, 'unsupported_object');
}
