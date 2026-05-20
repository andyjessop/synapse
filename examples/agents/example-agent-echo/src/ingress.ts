import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import type { SynapseEvent } from 'runtime-agent';
import type { RuntimePool } from 'runtime-store';
import {
  createIngressContext,
  defineIngress,
  definePollIngress,
  type PollIngressInput,
  type PollIngressResult,
} from 'runtime-worker';
import { z } from 'zod';

export const ECHO_AGENT_NAME = 'example-echo' as const;

export const ECHO_INGRESS_SOURCE =
  'synapse://example/agent-echo/ingress' as const;

export const EXAMPLE_POLL_HEARTBEAT_SOURCE = 'poll:example:heartbeat' as const;

export const exampleInMemoryHeartbeatPollParamsSchema = z
  .object({
    maxCandidates: z.number().int().positive().default(1),
  })
  .strict();

export type ExampleInMemoryHeartbeatPollParams = z.infer<
  typeof exampleInMemoryHeartbeatPollParamsSchema
>;

export const inMemoryHeartbeatCandidateSchema = z
  .object({
    message: z.string().min(1),
  })
  .strict();

export type ExampleInMemoryHeartbeatCandidate = z.infer<
  typeof inMemoryHeartbeatCandidateSchema
>;

export type ExampleInMemoryHeartbeatPollInput = PollIngressInput<
  ExampleInMemoryHeartbeatPollParams,
  ExampleInMemoryHeartbeatCandidate
>;

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
            'fixtures/example-agent-echo/ping.json',
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

export const triggerExampleInMemoryHeartbeatPoll = definePollIngress(
  async (
    ctx,
    input: ExampleInMemoryHeartbeatPollInput,
  ): Promise<PollIngressResult> => {
    const params = exampleInMemoryHeartbeatPollParamsSchema.parse(input.params);
    const candidates =
      input.candidates !== undefined
        ? z
            .array(inMemoryHeartbeatCandidateSchema)
            .min(1)
            .parse(input.candidates)
        : Array.from({ length: params.maxCandidates }, (_, index) => ({
            message: `poll-heartbeat-${input.polledAt}-${index}`,
          }));

    const rootEventIds: string[] = [];

    for (const candidate of candidates) {
      const externalId = `example-poll:${candidate.message}:${input.polledAt}`;
      const event = await ctx.emit(
        'example.ping.v1',
        { message: candidate.message },
        {
          source: EXAMPLE_POLL_HEARTBEAT_SOURCE,
          externalId,
          subject: candidate.message,
        },
      );
      rootEventIds.push(event.id);
    }

    return {
      emitted: rootEventIds.length,
      skipped: 0,
      failed: 0,
      rootEventIds,
    };
  },
);
