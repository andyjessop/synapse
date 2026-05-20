import type { Context } from 'hono';
import type { AdapterErrorBody } from 'runtime-adapters';

export type AdapterHttpStatus = 400 | 404 | 409 | 413 | 422 | 500 | 502;

export function jsonAdapterError(
  c: Context,
  status: AdapterHttpStatus,
  error: AdapterErrorBody['error'],
): Response {
  return c.json({ error }, status);
}

export class InvokeRouteError extends Error {
  constructor(
    readonly errorName: string,
    readonly status: AdapterHttpStatus,
    readonly body: AdapterErrorBody['error'],
  ) {
    super(body.message);
    this.name = errorName;
  }
}
