import { join } from 'node:path';
import { isCancel } from '@clack/prompts';
import { runDevOnce } from 'dev-once';
import { getRepoRoot, loadDotEnvLocal } from 'runtime-config';
import { listScenariosForManifest } from 'synapse-scenarios';
import { formatReviewPrDevStartupLine } from '../../agents/agent-reviewer/src/review-pr-manifest.js';

import {
  loadActiveDevManifest,
  parseDevOnceArgv,
  printDevOnceHelp,
  promptScenarioSelection,
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
  const { manifestPath, manifest } = loadActiveDevManifest(
    metaUrl,
    mode.manifestPath,
  );
  const entries = listScenariosForManifest(repoRoot, manifest);

  if (mode.list) {
    process.stdout.write(`Active dev session\n`);
    process.stdout.write(`manifest: ${manifest.name}\n`);
    process.stdout.write(`path: ${manifestPath}\n\n`);
    if (entries.length === 0) {
      process.stdout.write('(no scenarios listed on manifest)\n');
      return 0;
    }
    for (const entry of entries) {
      process.stdout.write(`  ${entry.id}  ${entry.title}\n`);
    }
    return 0;
  }

  let scenarioId = mode.scenarioId;
  if (scenarioId === undefined) {
    process.stdout.write(
      `Active manifest:\n  ${manifest.name}  ${manifestPath}\n\n`,
    );
    const choice = await promptScenarioSelection(entries);
    if (isCancel(choice)) {
      process.stdout.write('Cancelled.\n');
      return 1;
    }
    scenarioId = choice.scenarioId;
  }

  const useLiveGraph = !mode.json && !mode.noWait;

  if (
    useLiveGraph &&
    scenarioId.startsWith('review-pr/') &&
    manifest.agents.some((a) => a.name === 'agent-reviewer')
  ) {
    const envForPi = loadDotEnvLocal(join(repoRoot, '.env.local'), {
      ...process.env,
      SYNAPSE_RUNTIME_MANIFEST: manifestPath,
    });
    process.stdout.write(
      `${formatReviewPrDevStartupLine(envForPi, metaUrl)}\n`,
    );
    process.stdout.write(
      'Restart npm run dev after changing AGENT_REVIEWER_* or PI_* env or scenario adapter fixtures.\n\n',
    );
  }

  try {
    if (mode.clean && !mode.json) {
      process.stderr.write(
        '[dev:once:clean] wiping loopback Postgres runtime tables and reactor queue\n',
      );
    }
    const artifact = await runDevOnce({
      repoRoot,
      scenarioId,
      manifestPath: mode.manifestPath,
      clean: mode.clean,
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

    if (useLiveGraph) {
      process.stdout.write('\n');
    }
    process.stdout.write('Synapse Run Loop\n');
    process.stdout.write(`manifest: ${artifact.manifest.name}\n`);
    process.stdout.write(`scenario: ${artifact.scenario.id}\n`);
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
        process.stdout.write(`  ${event.type}  ${event.id}\n`);
      }
      process.stdout.write('\nAgent runs\n');
      for (const run of artifact.agentRuns) {
        process.stdout.write(
          `  ${run.agentName}  ${run.status}  ${run.reactorName}\n`,
        );
      }
    }

    return artifact.status === 'succeeded' ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`dev:once failed: ${message}\n`);
    return 1;
  }
}
