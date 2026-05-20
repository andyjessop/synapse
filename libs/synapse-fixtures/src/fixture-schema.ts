import {
  POLL_FIXTURE_SCHEMA_PATHS,
  type SynapsePollRunLoopFixture,
  type SynapseWebhookFixtureIngress,
  type SynapseWebhookRunLoopFixture,
  synapsePollFixtureIngressSchema,
  synapsePollRunLoopFixtureSchema,
  synapseWebhookFixtureExpectSchema,
  synapseWebhookFixtureIngressSchema,
  synapseWebhookRunLoopFixtureSchema,
  WEBHOOK_FIXTURE_SCHEMA_PATHS,
} from 'runtime-manifest';
import { z } from 'zod';

export {
  POLL_FIXTURE_SCHEMA_PATHS,
  synapsePollFixtureIngressSchema,
  synapseWebhookFixtureExpectSchema as synapseFixtureExpectSchema,
  synapseWebhookFixtureIngressSchema,
  WEBHOOK_FIXTURE_SCHEMA_PATHS,
};

export type SynapsePollFixtureIngress = z.infer<
  typeof synapsePollFixtureIngressSchema
>;

export type SynapseFixtureIngress =
  | SynapseWebhookFixtureIngress
  | SynapsePollFixtureIngress;

export type SynapseFixture =
  | SynapseWebhookRunLoopFixture
  | SynapsePollRunLoopFixture;

export const synapseFixtureIngressSchema = z.discriminatedUnion('kind', [
  synapseWebhookFixtureIngressSchema,
  synapsePollFixtureIngressSchema,
]);

export const synapseFixtureSchema = z.union([
  synapseWebhookRunLoopFixtureSchema,
  synapsePollRunLoopFixtureSchema,
]);

export function isWebhookRunLoopFixture(
  fixture: SynapseFixture,
): fixture is SynapseWebhookRunLoopFixture {
  return fixture.ingress.kind === 'webhook';
}

export function isPollRunLoopFixture(
  fixture: SynapseFixture,
): fixture is SynapsePollRunLoopFixture {
  return fixture.ingress.kind === 'poll';
}

export type {
  SynapsePollRunLoopFixture,
  SynapseWebhookFixtureIngress,
  SynapseWebhookRunLoopFixture,
};
