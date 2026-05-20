import { SCENARIO_RUN_ID_HEADER } from 'runtime-adapters';
import { type Scenario, WEBHOOK_ROUTE_CATALOG } from 'runtime-manifest';
import {
  type ResolvedIngressSource,
  resolveFixtureValueJson,
  resolveWebhookBodyBytes,
} from 'synapse-scenarios';

import {
  assertLoopbackIngressHost,
  buildIngressBaseUrl,
  parseIngressTargetFromEnv,
} from './ingress-target.js';
import {
  extractPollEmitCount,
  extractPollRootEventId,
} from './poll-response.js';
import {
  assertLoopbackWebhooksHost,
  parseAcceptedWebhookJson,
  postWebhookBody,
} from './webhook-post.js';

export type ScenarioIngressResult = {
  inputEventId: string;
};

export async function runScenarioWebhookStep(input: {
  repoRoot: string;
  ingressBase: string;
  scenario: Scenario;
  resolved: Extract<ResolvedIngressSource, { kind: 'webhook' }>;
  fixture: Scenario['ingress']['fixtures'][number];
  scenarioRunId?: string;
}): Promise<ScenarioIngressResult> {
  const body = resolveWebhookBodyBytes(input.repoRoot, input.fixture);
  const route = WEBHOOK_ROUTE_CATALOG[input.resolved.source];

  const headers: Record<string, string> = {
    ...('defaultHeaders' in route ? route.defaultHeaders : {}),
  };
  if (input.scenarioRunId !== undefined) {
    headers[SCENARIO_RUN_ID_HEADER] = input.scenarioRunId;
  }

  const post = await postWebhookBody({
    baseUrl: input.ingressBase,
    method: route.method,
    path: route.path,
    body,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  });
  if (!post.ok) {
    throw new Error(post.error);
  }

  const accepted = parseAcceptedWebhookJson(
    { ingress: { kind: 'webhook', method: route.method, path: route.path } },
    post.json,
  );
  if (!accepted.ok) {
    throw new Error(accepted.error);
  }

  return { inputEventId: accepted.event_id };
}

export async function runScenarioPollTick(input: {
  repoRoot: string;
  ingressBase: string;
  scenario: Scenario;
  resolved: Extract<ResolvedIngressSource, { kind: 'poll' }>;
  fixture: Scenario['ingress']['fixtures'][number];
  scenarioRunId?: string;
}): Promise<ScenarioIngressResult | undefined> {
  const ingressFixture = resolveFixtureValueJson(input.repoRoot, input.fixture);
  const url = `${input.ingressBase}/v1/poll/${encodeURIComponent(input.resolved.source)}/tick`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (input.scenarioRunId !== undefined) {
    headers[SCENARIO_RUN_ID_HEADER] = input.scenarioRunId;
  }
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      scenarioFixtureContext: {
        scenarioId: input.scenario.id,
        ingressFixture,
      },
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Poll scenario tick failed (${response.status}): ${text}`);
  }
  let summary: unknown;
  try {
    summary = JSON.parse(text) as { summary?: unknown };
  } catch {
    throw new Error(`Poll scenario tick returned non-JSON: ${text}`);
  }
  const payload =
    typeof summary === 'object' && summary !== null && 'summary' in summary
      ? (summary as { summary: unknown }).summary
      : summary;
  if (extractPollEmitCount(payload) === 0) {
    return undefined;
  }
  const rootEventId = extractPollRootEventId(payload);
  if (rootEventId === undefined) {
    throw new Error('Poll scenario response missing rootEventIds');
  }
  return { inputEventId: rootEventId };
}

export function resolveScenarioIngressBaseUrl(
  env: Record<string, string | undefined>,
): string {
  const ingressTarget = parseIngressTargetFromEnv(env);
  assertLoopbackIngressHost(ingressTarget.INGRESS_HOST);
  assertLoopbackWebhooksHost(ingressTarget.INGRESS_HOST);
  return buildIngressBaseUrl(
    ingressTarget.INGRESS_HOST,
    ingressTarget.INGRESS_PORT,
  );
}
