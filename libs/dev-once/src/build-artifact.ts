import {
  type DevOnceRunRecord,
  gatherDevOnceRunRecord,
  mapSynapseEventToDevOnceRunRecordEvent,
} from 'dev-cli-shared';
import type { SynapseEvent } from 'runtime-agent';
import type { RuntimePool } from 'runtime-store';
import type { SynapseFixture } from 'synapse-fixtures';

import {
  type SynapseRunArtifact,
  synapseRunArtifactSchema,
} from './artifact-schema.js';
import {
  type TerminalWaitResult,
  terminalToArtifactStatus,
} from './terminal.js';

export async function buildSynapseRunArtifact(input: {
  pool: RuntimePool;
  manifestName: string;
  manifestPath: string;
  fixture: SynapseFixture;
  fixturePath: string;
  inputEvent: SynapseEvent;
  terminal: TerminalWaitResult;
  graphSnapshotPath?: string;
  artifactPath?: string;
}): Promise<SynapseRunArtifact> {
  const record: DevOnceRunRecord = await gatherDevOnceRunRecord(
    input.pool,
    input.fixture.id,
    input.inputEvent,
  );

  const rootEvent = record.events.find((e) => e.id === input.inputEvent.id);

  return synapseRunArtifactSchema.parse({
    version: 1,
    status: terminalToArtifactStatus(input.terminal),
    manifest: {
      name: input.manifestName,
      path: input.manifestPath,
    },
    fixture: {
      id: input.fixture.id,
      path: input.fixturePath,
      title: input.fixture.title,
      agent: input.fixture.agent,
    },
    rootEvent:
      rootEvent ?? mapSynapseEventToDevOnceRunRecordEvent(input.inputEvent),
    events: record.events,
    agentRuns: record.agentRuns,
    observability: {
      jaegerTraceUrl: 'http://127.0.0.1:26686',
    },
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
