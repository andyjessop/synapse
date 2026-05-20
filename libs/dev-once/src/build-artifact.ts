import {
  type DevOnceRunRecord,
  gatherDevOnceRunRecord,
  mapSynapseEventToDevOnceRunRecordEvent,
} from 'dev-cli-shared';
import type { SynapseEvent } from 'runtime-agent';
import { parseRuntimeConfig } from 'runtime-config';
import {
  buildJaegerTraceUrl,
  traceIdFromTraceparent,
} from 'runtime-observability';
import type { RuntimePool } from 'runtime-store';
import type { Scenario } from 'synapse-scenarios';

import {
  type SynapseRunArtifact,
  synapseRunArtifactSchema,
} from './artifact-schema.js';
import {
  type TerminalWaitResult,
  terminalToArtifactStatus,
} from './terminal.js';

function resolveJaegerObservability(
  inputEvent: SynapseEvent,
  env: Record<string, string | undefined>,
): SynapseRunArtifact['observability'] {
  const traceparent = inputEvent.traceparent?.trim();
  if (traceparent === undefined || traceparent === '') {
    return undefined;
  }
  const config = parseRuntimeConfig(env);
  const traceId = traceIdFromTraceparent(traceparent);
  return {
    traceId,
    jaegerTraceUrl: buildJaegerTraceUrl(config.jaegerUiUrl, traceparent),
  };
}

export async function buildSynapseRunArtifact(input: {
  pool: RuntimePool;
  manifestName: string;
  manifestPath: string;
  scenario: Scenario;
  scenarioFilePath: string;
  inputEvent: SynapseEvent;
  terminal: TerminalWaitResult;
  graphSnapshotPath?: string;
  artifactPath?: string;
  env?: Record<string, string | undefined>;
}): Promise<SynapseRunArtifact> {
  const record: DevOnceRunRecord = await gatherDevOnceRunRecord(
    input.pool,
    input.scenario.id,
    input.inputEvent,
  );

  const rootEvent = record.events.find((e) => e.id === input.inputEvent.id);
  const observability = resolveJaegerObservability(
    input.inputEvent,
    input.env ?? process.env,
  );

  return synapseRunArtifactSchema.parse({
    version: 1,
    status: terminalToArtifactStatus(input.terminal),
    manifest: {
      name: input.manifestName,
      path: input.manifestPath,
    },
    scenario: {
      id: input.scenario.id,
      path: input.scenarioFilePath,
      title: input.scenario.title,
    },
    rootEvent:
      rootEvent ?? mapSynapseEventToDevOnceRunRecordEvent(input.inputEvent),
    events: record.events,
    agentRuns: record.agentRuns,
    ...(observability !== undefined ? { observability } : {}),
    files: {
      ...(input.graphSnapshotPath !== undefined
        ? { graphSnapshotPath: input.graphSnapshotPath }
        : {}),
      ...(input.artifactPath !== undefined
        ? { artifactPath: input.artifactPath }
        : {}),
    },
  });
}
