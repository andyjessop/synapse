import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import type { SynapseEvent } from 'runtime-agent';
import type { RuntimePool } from 'runtime-store';
import { createIngressContext } from 'runtime-worker';
import { z } from 'zod';

export const ECHO_AGENT_NAME = 'example-echo' as const;

export const ECHO_INGRESS_SOURCE =
  'synapse://example/agent-echo/ingress' as const;

const pingBodySchema = z
  .object({
    message: z.string().min(1).optional(),
  })
  .strict();

export type TriggerEchoPingInput = {
  pool: RuntimePool;
  repoRoot: string;
  fixtureFile?: string;
  body?: z.infer<typeof pingBodySchema>;
};

export function resolveIngressFixturePath(
  repoRoot: string,
  fixtureFile: string | undefined,
  defaultRepoRelative: string,
): string {
  const rel = fixtureFile ?? defaultRepoRelative;
  return isAbsolute(rel) ? rel : join(repoRoot, rel);
}

export async function triggerEchoPing(
  input: TriggerEchoPingInput,
): Promise<SynapseEvent> {
  const body =
    input.body ??
    pingBodySchema.parse(
      JSON.parse(
        readFileSync(
          resolveIngressFixturePath(
            input.repoRoot,
            input.fixtureFile,
            'examples/fixtures/example-agent-echo/ping.json',
          ),
          'utf8',
        ),
      ),
    );
  const ctx = createIngressContext({
    agent: ECHO_AGENT_NAME,
    source: ECHO_INGRESS_SOURCE,
    store: input.pool,
  });
  return ctx.emit('example.ping.v1', body, {
    source: ECHO_INGRESS_SOURCE,
    externalId: `example-ping:${body.message ?? 'fixture'}`,
    subject: body.message,
  });
}
