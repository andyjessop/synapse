import * as p from '@clack/prompts';
import {
  killSynapseDevProcessPids,
  listSynapseDevProcesses,
  type SynapseDevProcess,
} from 'dev-cli-shared';

function formatProcessLines(processes: readonly SynapseDevProcess[]): string {
  return processes.map((proc) => `  ${proc.pid}  ${proc.command}`).join('\n');
}

function shouldAutoKillOrphans(env: NodeJS.ProcessEnv): boolean {
  const raw = env.SYNAPSE_DEV_KILL_ORPHANS?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

/**
 * If worker/ingress/adapters from a prior dev session are still running, ask to stop them.
 */
export async function confirmStopRunningDevProcesses(
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const running = listSynapseDevProcesses(repoRoot);
  if (running.length === 0) {
    return;
  }

  if (shouldAutoKillOrphans(env)) {
    p.log.warn(
      `Stopping ${running.length} running Synapse dev process(es) (SYNAPSE_DEV_KILL_ORPHANS).`,
    );
    killSynapseDevProcessPids(running.map((proc) => proc.pid));
    return;
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      `Synapse dev processes are already running for this repo:\n${formatProcessLines(running)}\nStop them manually, or set SYNAPSE_DEV_KILL_ORPHANS=1, or run npm run dev in a terminal.`,
    );
  }

  p.log.warn(
    `Found ${running.length} running Synapse dev process(es) for this repo:`,
  );
  p.log.message(formatProcessLines(running));

  const confirmed = await p.confirm({
    message: 'Stop these processes before starting?',
    initialValue: true,
  });
  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel('Dev startup cancelled.');
    throw new Error(
      'Dev startup cancelled: existing Synapse processes still running.',
    );
  }

  killSynapseDevProcessPids(running.map((proc) => proc.pid));
  p.log.success('Stopped prior Synapse dev processes.');
}
