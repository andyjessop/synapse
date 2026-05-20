import {
  type ExampleInMemoryHeartbeatCandidate,
  type ExampleInMemoryHeartbeatPollInput,
  exampleInMemoryHeartbeatPollParamsSchema,
  inMemoryHeartbeatCandidateSchema,
  triggerExampleInMemoryHeartbeatPoll,
} from 'example-agent-echo/ingress';
import { createIngressContext } from 'runtime-worker';
import { z } from 'zod';

import {
  consumeScenarioAdapterFixture,
  resolveFixtureValueJson,
} from '../../scenario/scenario-adapter-match.js';
import type { PollRegistrar } from '../poll-source-registry.js';

export const exampleInMemoryHeartbeatRegistrar: PollRegistrar = async (
  deps,
) => {
  const params = exampleInMemoryHeartbeatPollParamsSchema.parse(
    deps.resolved.params,
  );

  const ctx = createIngressContext({
    agent: deps.resolved.owner,
    source: 'poll:example:heartbeat',
    store: deps.pool,
    tracer: deps.observability?.tracer,
  });

  let candidates: ExampleInMemoryHeartbeatCandidate[] | undefined;

  if (deps.scenarioFixtureContext?.ingressFixture !== undefined) {
    candidates = z
      .array(inMemoryHeartbeatCandidateSchema)
      .parse(deps.scenarioFixtureContext.ingressFixture);
  } else if (deps.scenarioAdapterState !== undefined) {
    const fixture = consumeScenarioAdapterFixture(deps.scenarioAdapterState, {
      source: deps.resolved.id,
      method: 'listCandidates',
      params,
      repoRoot: deps.repoRoot,
    });
    candidates = resolveFixtureValueJson(
      deps.repoRoot,
      fixture.returns,
    ) as ExampleInMemoryHeartbeatCandidate[];
  }

  const pollInput: ExampleInMemoryHeartbeatPollInput = {
    params,
    polledAt: new Date().toISOString(),
    ...(candidates !== undefined ? { candidates } : {}),
  };

  return triggerExampleInMemoryHeartbeatPoll(ctx, pollInput);
};
