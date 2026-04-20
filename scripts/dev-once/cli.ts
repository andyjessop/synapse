import * as p from '@clack/prompts';
import { readDevSession } from 'dev-cli-shared';
import { parseRuntimeManifestFile } from 'runtime-manifest';
import { getRepoRoot } from 'runtime-config';
import { listManifestFixtures } from 'synapse-fixtures';

export type DevOnceCliMode = {
  list: boolean;
  json: boolean;
  help: boolean;
  noWait: boolean;
  fixtureId?: string;
};

export function parseDevOnceArgv(argv: readonly string[]): DevOnceCliMode {
  const mode: DevOnceCliMode = {
    list: false,
    json: false,
    help: false,
    noWait: false,
  };
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--list') {
      mode.list = true;
      continue;
    }
    if (arg === '--manifest') {
      throw new Error(
        'dev:once does not accept --manifest. Start the stack with: npm run dev -- --manifest <path>',
      );
    }
    if (arg === '--examples') {
      throw new Error(
        'dev:once does not accept --examples. Use npm run dev -- --manifest manifests/examples/echo.json',
      );
    }
    if (arg === '--json') {
      mode.json = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      mode.help = true;
      continue;
    }
    if (arg === '--no-wait') {
      mode.noWait = true;
      continue;
    }
    if (arg === '--fixture') {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) {
        throw new Error('Expected --fixture <id>');
      }
      mode.fixtureId = next;
      i += 1;
      continue;
    }
    if (arg.startsWith('--fixture=')) {
      mode.fixtureId = arg.slice('--fixture='.length);
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown flag: ${arg}. Try --help.`);
    }
    positionals.push(arg);
  }

  if (positionals.length > 1) {
    throw new Error('Expected at most one fixture id (positional argument).');
  }
  if (positionals[0] !== undefined && mode.fixtureId === undefined) {
    mode.fixtureId = positionals[0];
  }
  return mode;
}

export function printDevOnceHelp(): void {
  const lines = [
    'Synapse Run Loop — send one fixture into the active dev session.',
    '',
    'Prerequisites: npm run dev (writes .synapse/dev-session.json)',
    '',
    'Commands:',
    '  npm run dev:once -- --fixture <id>   Run one manifest fixture',
    '  npm run dev:once -- --list           List agents and fixtures',
    '  npm run dev:once                     Interactive agent + fixture picker',
    '',
    'Flags:',
    '  --list        List fixtures for the active dev session',
    '  --json        Print SynapseRunArtifact JSON only',
    '  --no-wait     Send ingress and exit without waiting for terminal state',
    '  --help, -h    Show this help',
    '',
    'Examples:',
    '  npm run dev -- --manifest manifests/examples/echo.json',
    '  npm run dev:once -- --fixture example/echo',
    '  npm run dev:once -- --fixture review-pr/gitlab-synapse',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

export function loadSessionManifest(metaUrl: string | URL) {
  const repoRoot = getRepoRoot(metaUrl);
  const session = readDevSession(repoRoot);
  const manifest = parseRuntimeManifestFile(session.manifest_path);
  return { repoRoot, session, manifest };
}

export async function promptFixtureSelection(
  entries: ReturnType<typeof listManifestFixtures>,
): Promise<{ fixtureId: string } | symbol> {
  if (entries.length === 0) {
    return p.cancel('No fixtures in this manifest.');
  }

  const agents = [...new Set(entries.map((e) => e.agent))];
  const agent =
    agents.length === 1
      ? agents[0]
      : await p.select({
          message: 'Select agent',
          options: agents.map((name) => ({ value: name, label: name })),
        });
  if (p.isCancel(agent)) {
    return agent;
  }

  const forAgent = entries.filter((e) => e.agent === agent);
  const fixtureId = await p.select({
    message: 'Select fixture',
    options: forAgent.map((e) => ({
      value: e.id,
      label: `${e.id}  ${e.title}`,
    })),
  });
  if (p.isCancel(fixtureId)) {
    return fixtureId;
  }
  return { fixtureId };
}
