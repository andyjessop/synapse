import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getRepoRoot } from 'runtime-config';

const ADAPTER_FIXTURE =
  'fixtures/agent-reviewer/adapters/gitlab-fetch-changes-synapse.json';

/** Flat MR changes JSON for `createGitLabMergeRequestFixtureClient` tests. */
export function mrChangesFixtureClientInput(importMetaUrl: string): {
  repoRoot: string;
  changesFile: string;
} {
  const synapseRoot = getRepoRoot(importMetaUrl);
  const adapter = JSON.parse(
    readFileSync(join(synapseRoot, ADAPTER_FIXTURE), 'utf8'),
  ) as { response: unknown };
  const dir = mkdtempSync(join(tmpdir(), 'adapter-gitlab-fc-'));
  const changesFile = 'mr-changes.json';
  writeFileSync(join(dir, changesFile), JSON.stringify(adapter.response));
  return { repoRoot: dir, changesFile };
}
