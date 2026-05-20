import * as p from '@clack/prompts';
import { resolveDevOnceManifestPath } from 'dev-cli-shared';
import { getRepoRoot } from 'runtime-config';
import { parseRuntimeManifestFile } from 'runtime-manifest';
import { listScenariosForManifest } from 'synapse-scenarios';

export type DevOnceCliMode = {
  list: boolean;
  json: boolean;
  help: boolean;
  noWait: boolean;
  clean: boolean;
  scenarioId?: string;
  manifestPath?: string;
};

export function parseDevOnceArgv(argv: readonly string[]): DevOnceCliMode {
  const mode: DevOnceCliMode = {
    list: false,
    json: false,
    help: false,
    noWait: false,
    clean: false,
  };
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--list') {
      mode.list = true;
      continue;
    }
    if (arg === '--manifest') {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) {
        throw new Error('Expected --manifest <path>');
      }
      mode.manifestPath = next;
      i += 1;
      continue;
    }
    if (arg.startsWith('--manifest=')) {
      mode.manifestPath = arg.slice('--manifest='.length);
      continue;
    }
    if (arg === '--examples') {
      throw new Error(
        'dev:once does not accept --examples. Use npm run dev:once -- --manifest manifests/examples/echo.json',
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
    if (arg === '--clean') {
      throw new Error(
        'dev:once does not accept --clean. Use: npm run dev:once:clean [-- --scenario <id>]',
      );
    }
    if (arg === '--scenario' || arg === '--fixture') {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) {
        throw new Error(`Expected ${arg} <id>`);
      }
      mode.scenarioId = next;
      i += 1;
      continue;
    }
    if (arg.startsWith('--scenario=') || arg.startsWith('--fixture=')) {
      const prefix = arg.startsWith('--scenario=')
        ? '--scenario='
        : '--fixture=';
      mode.scenarioId = arg.slice(prefix.length);
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown flag: ${arg}. Try --help.`);
    }
    positionals.push(arg);
  }

  if (positionals.length > 1) {
    throw new Error('Expected at most one scenario id (positional argument).');
  }
  if (positionals[0] !== undefined && mode.scenarioId === undefined) {
    mode.scenarioId = positionals[0];
  }
  if (process.env.SYNAPSE_DEV_ONCE_CLEAN === '1') {
    mode.clean = true;
  }
  return mode;
}

export function printDevOnceHelp(): void {
  const lines = [
    'Synapse Run Loop — run one scenario against the local dev stack.',
    '',
    'Prerequisites: npm run dev (stack running in another terminal).',
    '',
    'Manifest: defaults to manifests/application.json. Pass --manifest when',
    'the stack was started with npm run dev -- --manifest <path>.',
    '',
    'Commands:',
    '  npm run dev:once -- --scenario <id>   Run one manifest scenario',
    '  npm run dev:once -- --fixture <id>    Alias for --scenario',
    '  npm run dev:once -- --list            List scenarios for the active manifest',
    '  npm run dev:once                      Interactive scenario picker',
    '  npm run dev:once:clean                Same, but wipe Postgres + reactor queue first',
    '  npm run dev:once:clean -- --scenario <id>',
    '',
    'Flags:',
    '  --manifest <path>  Manifest JSON (default: manifests/application.json)',
    '  --list             List scenarios whose manifests[] includes the manifest name',
    '  --json             Print SynapseRunArtifact JSON only',
    '  --no-wait          Trigger ingress and exit without waiting for terminal state',
    '  --help, -h         Show this help',
    '',
    'Examples:',
    '  npm run dev',
    '  npm run dev:once -- --scenario review-pr/gitlab-synapse',
    '  npm run dev -- --manifest manifests/examples/echo.json',
    '  npm run dev:once -- --manifest manifests/examples/echo.json --scenario example/echo',
    '  npm run dev:once:clean -- --scenario review-pr/gitlab-synapse',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

export function loadActiveDevManifest(
  metaUrl: string | URL,
  manifestPathOverride?: string,
) {
  const repoRoot = getRepoRoot(metaUrl);
  const manifestPath = resolveDevOnceManifestPath(
    repoRoot,
    manifestPathOverride,
  );
  const manifest = parseRuntimeManifestFile(manifestPath);
  return { repoRoot, manifestPath, manifest };
}

export async function promptScenarioSelection(
  entries: ReturnType<typeof listScenariosForManifest>,
): Promise<{ scenarioId: string } | symbol> {
  if (entries.length === 0) {
    return p.cancel('No scenarios in this manifest.');
  }

  const scenarioId = await p.select({
    message: 'Select scenario',
    options: entries.map((e) => ({
      value: e.id,
      label: `${e.id}  ${e.title}`,
    })),
  });
  if (p.isCancel(scenarioId)) {
    return scenarioId;
  }
  return { scenarioId };
}
