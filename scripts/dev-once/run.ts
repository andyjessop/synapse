import { isCancel } from '@clack/prompts';
import { formatRunRecordFlow } from 'dev-cli-shared';
import { runDevOnce } from 'dev-once';
import { join } from 'node:path';
import { formatReviewPrDevStartupLine } from '../../agents/agent-reviewer/src/review-pr-manifest.js';
import { loadDotEnvLocal, getRepoRoot } from 'runtime-config';
import { listManifestFixtures } from 'synapse-fixtures';

import {
  loadSessionManifest,
  parseDevOnceArgv,
  printDevOnceHelp,
  promptFixtureSelection,
} from './cli.js';
export async function runDevOnceCli(
  argv: readonly string[],
  metaUrl: string | URL,
): Promise<number> {
  const mode = parseDevOnceArgv(argv);
  if (mode.help) {
    printDevOnceHelp();
    return 0;
  }

  const repoRoot = getRepoRoot(metaUrl);
  const { session, manifest } = loadSessionManifest(metaUrl);
  const entries = listManifestFixtures(manifest, repoRoot);

  if (mode.list) {
    process.stdout.write(`Active dev session\n`);
    process.stdout.write(`manifest: ${session.manifest_name}\n`);
    process.stdout.write(`path: ${session.manifest_path}\n\n`);
    if (entries.length === 0) {
      process.stdout.write('(no fixtures listed on manifest agents)\n');
      return 0;
    }
    const byAgent = new Map<string, typeof entries>();
    for (const entry of entries) {
      const list = byAgent.get(entry.agent) ?? [];
      list.push(entry);
      byAgent.set(entry.agent, list);
    }
    for (const [agent, list] of byAgent) {
      process.stdout.write(`${agent}\n`);
      for (const f of list) {
        process.stdout.write(`  ${f.id}  ${f.title}\n`);
      }
    }
    return 0;
  }

  let fixtureId = mode.fixtureId;
  if (fixtureId === undefined) {
    process.stdout.write(
      `Active manifest:\n  ${session.manifest_name}  ${session.manifest_path}\n\n`,
    );
    const choice = await promptFixtureSelection(entries);
    if (isCancel(choice)) {
      process.stdout.write('Cancelled.\n');
      return 1;
    }
    fixtureId = choice.fixtureId;
  }

  const useLiveGraph = !mode.json && !mode.noWait;

  const entry = entries.find((e) => e.id === fixtureId);
  if (
    useLiveGraph &&
    entry?.agent === 'agent-reviewer' &&
    fixtureId.startsWith('review-pr/')
  ) {
    const envForPi = loadDotEnvLocal(join(repoRoot, '.env.local'), {
      ...process.env,
      SYNAPSE_RUNTIME_MANIFEST: session.manifest_path,
    });
    process.stdout.write(
      `${formatReviewPrDevStartupLine(envForPi, metaUrl)}\n`,
    );
    process.stdout.write(
      'Restart npm run dev after changing AGENT_REVIEWER_* or PI_* env or manifest fixtures.adapter.\n\n',
    );
  }

  try {
    const artifact = await runDevOnce({
      repoRoot,
      fixtureId,
      noWait: mode.noWait,
      liveGraph: useLiveGraph,
      onLiveGraphLine: useLiveGraph
        ? (line) => {
            process.stdout.write(`${line}\n`);
          }
        : undefined,
    });

    if (mode.json) {
      process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
      return artifact.status === 'succeeded' ? 0 : 1;
    }

    process.stdout.write('Synapse Run Loop\n');
    process.stdout.write(`manifest: ${artifact.manifest.name}\n`);
    process.stdout.write(`fixture: ${artifact.fixture.id}\n`);
    if (artifact.rootEvent !== undefined) {
      process.stdout.write(`root event: ${artifact.rootEvent.id}\n`);
    }
    process.stdout.write(`status: ${artifact.status}\n`);
    if (artifact.files?.graphSnapshotPath !== undefined) {
      process.stdout.write(`artifact: ${artifact.files.graphSnapshotPath}\n`);
    }
    if (artifact.observability?.jaegerTraceUrl !== undefined) {
      process.stdout.write(
        `jaeger: ${artifact.observability.jaegerTraceUrl}\n`,
      );
    }

    if (!useLiveGraph) {
      process.stdout.write('\nEvents\n');
      for (const event of artifact.events) {
        process.stdout.write(`  ${event.id} ${event.type}\n`);
      }
      process.stdout.write('\nAgent runs\n');
      for (const run of artifact.agentRuns) {
        process.stdout.write(
          `  ${run.id} ${run.agentName} ${run.reactorName} ${run.status}\n`,
        );
      }
      const flow = formatRunRecordFlow({
        version: 1,
        recordedAt: new Date().toISOString(),
        scenarioId: artifact.fixture.id,
        inputEventId: artifact.rootEvent?.id ?? '',
        rootId: artifact.rootEvent?.rootId ?? '',
        events: artifact.events,
        agentRuns: artifact.agentRuns,
      });
      process.stdout.write(`\n${flow}\n`);
    } else if (artifact.status === 'failed') {
      for (const run of artifact.agentRuns) {
        if (run.status === 'failed' && run.lastError !== undefined) {
          process.stderr.write(
            `\n[dev:once] ${run.agentName}/${run.reactorName} failed: ${run.lastError}\n`,
          );
        }
      }
    }

    return artifact.status === 'succeeded' ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (mode.json) {
      process.stdout.write(`${JSON.stringify({ error: message }, null, 2)}\n`);
    } else {
      process.stderr.write(`${message}\n`);
    }
    return 1;
  }
}
