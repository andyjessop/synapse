import type { SynapseFixture } from 'synapse-fixtures';
import { z } from 'zod';

const prWebhookAcceptedResponseSchema = z
  .object({
    event_id: z.string().min(1),
    type: z.literal('pr.received.v1'),
    external_id: z.string().min(1),
    subject: z.string().min(1),
  })
  .strict();

const exampleEchoPingAcceptedResponseSchema = z
  .object({
    event_id: z.string().min(1),
    type: z.literal('example.ping.v1'),
    external_id: z.string().min(1),
    subject: z.string().optional(),
  })
  .strict();

export function buildWebhooksBaseUrl(host: string, port: number): string {
  const h = host.includes(':') ? `[${host}]` : host;
  return `http://${h}:${port}`;
}

export function assertLoopbackWebhooksHost(host: string): void {
  const normalized = host.trim().toLowerCase();
  if (
    normalized !== '127.0.0.1' &&
    normalized !== 'localhost' &&
    normalized !== '::1'
  ) {
    throw new Error(
      `WEBHOOKS_HOST must be a loopback address for dev:once (got "${host}"). Remote targets are out of scope.`,
    );
  }
}

export async function postWebhookFixture(input: {
  baseUrl: string;
  fixture: SynapseFixture;
  body: Buffer;
}): Promise<
  | { ok: true; status: number; json: unknown }
  | { ok: false; status?: number; error: string }
> {
  const url = `${input.baseUrl.replace(/\/$/, '')}${input.fixture.ingress.path}`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(input.fixture.ingress.headers ?? {}),
  };
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: input.body,
    });
    const text = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = { raw: text };
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `HTTP ${response.status}: ${text.slice(0, 500)}`,
      };
    }
    return { ok: true, status: response.status, json };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

export function parseAcceptedWebhookJson(
  fixture: SynapseFixture,
  json: unknown,
): { ok: true; event_id: string } | { ok: false; error: string } {
  if (fixture.ingress.path === '/v1/prs') {
    const parsed = prWebhookAcceptedResponseSchema.safeParse(json);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Webhook body did not match pr acceptance schema',
      };
    }
    return { ok: true, event_id: parsed.data.event_id };
  }
  if (fixture.ingress.path === '/v1/examples/echo/ping') {
    const parsed = exampleEchoPingAcceptedResponseSchema.safeParse(json);
    if (!parsed.success) {
      return {
        ok: false,
        error: 'Webhook body did not match example echo acceptance schema',
      };
    }
    return { ok: true, event_id: parsed.data.event_id };
  }
  return {
    ok: false,
    error: `No response parser for path ${fixture.ingress.path}`,
  };
}
