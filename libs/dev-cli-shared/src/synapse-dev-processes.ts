import { execSync } from 'node:child_process';

export type SynapseDevProcess = {
  pid: number;
  command: string;
};

function pgrepPatterns(repoRoot: string): string[] {
  const escaped = repoRoot.replace(/'/g, "'\\''");
  return [
    `${escaped}.*nx run worker:start`,
    `${escaped}.*nx run ingress:start`,
    `${escaped}.*nx run adapters:start`,
    `${escaped}.*apps/worker`,
    `${escaped}.*apps/ingress`,
    `${escaped}.*apps/adapters`,
  ];
}

function parsePgrepOutput(raw: string): SynapseDevProcess[] {
  const byPid = new Map<number, string>();
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') {
      continue;
    }
    const space = trimmed.indexOf(' ');
    if (space <= 0) {
      continue;
    }
    const pid = Number.parseInt(trimmed.slice(0, space), 10);
    if (!Number.isFinite(pid) || pid <= 0) {
      continue;
    }
    byPid.set(pid, trimmed.slice(space + 1));
  }
  return [...byPid.entries()]
    .map(([pid, command]) => ({ pid, command }))
    .sort((a, b) => a.pid - b.pid);
}

/** Running worker, ingress, or adapters children for this repo (from a prior `npm run dev`). */
export function listSynapseDevProcesses(repoRoot: string): SynapseDevProcess[] {
  const byPid = new Map<number, string>();
  for (const pattern of pgrepPatterns(repoRoot)) {
    let raw = '';
    try {
      raw = execSync(`pgrep -fl '${pattern}' 2>/dev/null || true`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
    } catch {
      continue;
    }
    for (const entry of parsePgrepOutput(raw)) {
      byPid.set(entry.pid, entry.command);
    }
  }
  return [...byPid.entries()]
    .map(([pid, command]) => ({ pid, command }))
    .sort((a, b) => a.pid - b.pid);
}

export function killSynapseDevProcessPids(pids: readonly number[]): void {
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // already exited or not signalable
    }
  }
}

/** @deprecated Prefer {@link listSynapseDevProcesses} + {@link killSynapseDevProcessPids}. */
export function stopOrphanSynapseWorkers(repoRoot: string): void {
  killSynapseDevProcessPids(
    listSynapseDevProcesses(repoRoot).map((entry) => entry.pid),
  );
}
