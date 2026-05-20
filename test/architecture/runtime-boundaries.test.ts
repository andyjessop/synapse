import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(fileURLToPath(new URL('../..', import.meta.url)));

type ArchitectureRule = {
  name: string;
  pattern: RegExp;
  message: string;
};

function importFromModule(moduleName: string): RegExp {
  const escaped = moduleName.replace(/\//g, '\\/');
  return new RegExp(
    `(?:from\\s+['"]${escaped}['"]|import\\s+['"]${escaped}['"])`,
  );
}

function listSourceFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      out.push(...listSourceFilesRecursive(path));
    } else if (entry.isFile() && path.endsWith('.ts')) {
      out.push(path);
    }
  }
  return out;
}

function collectPackageSources(prefix: string): string[] {
  const base = join(repoRoot, prefix);
  const out: string[] = [];
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const src = join(base, entry.name, 'src');
    try {
      out.push(...listSourceFilesRecursive(src));
    } catch {
      // package without src/
    }
  }
  return out;
}

function findViolations(
  files: readonly string[],
  rules: readonly ArchitectureRule[],
): { file: string; message: string }[] {
  const violations: { file: string; message: string }[] = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const rule of rules) {
      if (rule.pattern.test(source)) {
        violations.push({
          file: file.replace(`${repoRoot}/`, ''),
          message: rule.message,
        });
      }
    }
  }
  return violations;
}

describe('adapter RPC runtime boundaries', () => {
  const runtimeLibFiles = readdirSync(join(repoRoot, 'libs'), {
    withFileTypes: true,
  })
    .filter((e) => e.isDirectory() && e.name.startsWith('runtime-'))
    .flatMap((e) => listSourceFilesRecursive(join(repoRoot, 'libs', e.name)));

  const runtimeManifestFiles = listSourceFilesRecursive(
    join(repoRoot, 'libs/runtime-manifest'),
  ).filter(
    (file) => !file.includes(`${join('libs', 'runtime-manifest', 'test')}`),
  );

  const agentFiles = collectPackageSources('agents');

  const adaptersAppSrcFiles = listSourceFilesRecursive(
    join(repoRoot, 'apps/adapters/src'),
  );

  const adaptersAppAllTsFiles = listSourceFilesRecursive(
    join(repoRoot, 'apps/adapters'),
  ).filter((file) => file.endsWith('.ts'));

  const workerAppSrcFiles = listSourceFilesRecursive(
    join(repoRoot, 'apps/worker/src'),
  );

  const adapterPackageFiles = listSourceFilesRecursive(
    join(repoRoot, 'adapters'),
  );

  it('runtime libs do not import adapter packages', () => {
    const violations = findViolations(runtimeLibFiles, [
      {
        name: 'runtime imports adapter',
        pattern:
          /from\s+['"]adapter-[^'"]+['"]|import\s+['"]adapter-[^'"]+['"]/,
        message: 'libs/runtime-* must not import adapters/*.',
      },
    ]);
    expect(violations).toEqual([]);
  });

  it('runtime-manifest does not export vendor adapter catalog or contracts', () => {
    const violations = findViolations(runtimeManifestFiles, [
      {
        name: 'gitlab vendor exports',
        pattern:
          /export\s+(type\s+)?\{[^}]*GitLab|gitlabFetchChanges|GitLabMrChanges|GitLabMergeRequestClient|gitlab-merge-request-client/,
        message:
          'runtime-manifest must not export GitLab params/results/clients; use adapters/adapter-gitlab.',
      },
      {
        name: 'shipped adapter catalog in manifest',
        pattern: /SHIPPED_ADAPTER_SOURCES|ADAPTER_SOURCE_CATALOG/,
        message:
          'Shipped adapter catalog belongs in apps/adapters, not runtime-manifest.',
      },
    ]);
    expect(violations).toEqual([]);
  });

  it('adapter-gitlab default export is contracts-only', () => {
    const indexSource = readFileSync(
      join(repoRoot, 'adapters/adapter-gitlab/src/index.ts'),
      'utf8',
    );
    expect(indexSource).toContain("export * from './contracts.js'");
    expect(indexSource).not.toMatch(
      /live-client|mock-client|fixture-client|methods\/fetch-changes|\/fixtures\.js/,
    );

    const contractsSource = readFileSync(
      join(repoRoot, 'adapters/adapter-gitlab/src/contracts.ts'),
      'utf8',
    );
    expect(contractsSource).not.toMatch(
      /runtime-adapters|defineAdapterMethod|methods\/fetch-changes/,
    );
    expect(contractsSource).toMatch(/from '\.\/(client|schemas)\.js'/);
  });

  it('agents import adapter-gitlab contracts only', () => {
    const violations = findViolations(agentFiles, [
      {
        name: 'agent forbidden subpath',
        pattern:
          /adapter-gitlab\/(?:live|methods|fixtures|testing)|from\s+['"]adapter-gitlab\/(?:live|methods|fixtures|testing)['"]/,
        message:
          'agents may import adapter-gitlab (contracts) only; not /live, /methods, /fixtures, or /testing.',
      },
      {
        name: 'agent live or method symbols',
        pattern:
          /createGitLabMergeRequest(?:Live|Mock|Fixture)Client|gitlabFetchChangesMethod|loadGitlabAdapterFixtureFile/,
        message:
          'agents must use ctx.adapters; not adapter live clients or method modules.',
      },
    ]);
    expect(violations).toEqual([]);
  });

  it('apps/adapters imports adapter definitions only from shipped-adapters.ts', () => {
    const shippedAdaptersPath = join(
      repoRoot,
      'apps/adapters/src/shipped-adapters.ts',
    );
    const allowedRel = join('apps', 'adapters', 'src', 'shipped-adapters.ts');
    for (const file of adaptersAppAllTsFiles) {
      const rel = relative(repoRoot, file);
      if (rel === allowedRel) {
        continue;
      }
      const source = readFileSync(file, 'utf8');
      const violations = [
        ...source.matchAll(
          /from\s+['"]adapter-[^'"]+\/definition['"]|import\s+['"]adapter-[^'"]+\/definition['"]/g,
        ),
        ...source.matchAll(
          /from\s+['"]adapter-[^'"]+\/methods['"]|import\s+['"]adapter-[^'"]+\/methods['"]/g,
        ),
      ];
      expect(
        violations,
        `${rel} must not import adapter-*/definition or adapter-*/methods`,
      ).toHaveLength(0);
    }
    const shippedSource = readFileSync(shippedAdaptersPath, 'utf8');
    expect(shippedSource).toMatch(/adapter-[^'"]+\/definition/);
  });

  it('runtime-agent stays generic', () => {
    const runtimeAgentFiles = listSourceFilesRecursive(
      join(repoRoot, 'libs/runtime-agent'),
    );
    const violations = findViolations(runtimeAgentFiles, [
      {
        name: 'runtime-agent imports runtime-events',
        pattern: importFromModule('runtime-events'),
        message: 'runtime-agent must not import runtime-events.',
      },
      {
        name: 'runtime-agent value-imports runtime-adapters',
        pattern:
          /import\s+(?!type\s)(?:type\s+)?\{[^}]+\}\s+from\s+['"]runtime-adapters['"]/,
        message:
          'runtime-agent may import types from runtime-adapters only via import type.',
      },
      {
        name: 'runtime-agent imports runtime-worker',
        pattern: importFromModule('runtime-worker'),
        message: 'runtime-agent must not import runtime-worker.',
      },
    ]);
    expect(violations).toEqual([]);
  });

  it('runtime-manifest does not import runtime-events or shipped definitions', () => {
    const violations = findViolations(runtimeManifestFiles, [
      {
        name: 'runtime-manifest imports runtime-events',
        pattern: importFromModule('runtime-events'),
        message: 'runtime-manifest receives knownEventTypes from apps.',
      },
      {
        name: 'runtime-manifest imports shipped agents',
        pattern:
          /shipped-agents|agent-[^'"]+\/definition|adapter-[^'"]+\/definition/,
        message:
          'runtime-manifest must not import shipped agent/adapter lists.',
      },
    ]);
    expect(violations).toEqual([]);
  });

  it('adapter packages do not import runtime-manifest', () => {
    const violations = findViolations(adapterPackageFiles, [
      {
        name: 'adapter imports runtime-manifest',
        pattern: importFromModule('runtime-manifest'),
        message: 'adapters/* must not depend on runtime-manifest.',
      },
    ]);
    expect(violations).toEqual([]);
  });

  it('apps/worker imports agent definitions only from shipped-agents.ts', () => {
    const shippedAgentsPath = join(
      repoRoot,
      'apps/worker/src/shipped-agents.ts',
    );
    for (const file of workerAppSrcFiles) {
      const rel = relative(repoRoot, file);
      if (rel === join('apps', 'worker', 'src', 'shipped-agents.ts')) {
        continue;
      }
      const source = readFileSync(file, 'utf8');
      const violations = [
        ...source.matchAll(
          /from\s+['"](?:agent-|example-agent-)[^'"]+\/definition['"]|import\s+['"](?:agent-|example-agent-)[^'"]+\/definition['"]/g,
        ),
      ];
      expect(
        violations,
        `${rel} must not import agent-*/definition or example-agent-*/definition`,
      ).toHaveLength(0);
    }
    const shippedSource = readFileSync(shippedAgentsPath, 'utf8');
    expect(shippedSource).toMatch(
      /(?:agent-|example-agent-)[^'"]+\/definition/,
    );
  });

  it('adapter definition subpaths export composition only', () => {
    const violations: { file: string; message: string }[] = [];
    for (const entry of readdirSync(join(repoRoot, 'adapters'), {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const definitionPath = join(
        repoRoot,
        'adapters',
        entry.name,
        'src',
        'definition.ts',
      );
      try {
        const source = readFileSync(definitionPath, 'utf8');
        if (/from\s+['"]\.\/methods\//.test(source)) {
          violations.push({
            file: relative(repoRoot, definitionPath),
            message:
              'adapter-*/definition must not re-export method modules; export the adapter definition only.',
          });
        }
      } catch {
        // package without definition.ts
      }
    }
    expect(violations).toEqual([]);
  });

  it('agent-test-harness does not import shipped agents or application agents', () => {
    const harnessFiles = listSourceFilesRecursive(
      join(repoRoot, 'libs/agent-test-harness/src'),
    );
    const violations = findViolations(harnessFiles, [
      {
        name: 'harness imports agent definition',
        pattern:
          /from\s+['"](?:agent-|example-agent-)[^'"]+\/definition['"]|import\s+['"](?:agent-|example-agent-)[^'"]+\/definition['"]/,
        message:
          'agent-test-harness must not import agent-*/definition or example-agent-*/definition; callers pass shippedAgents.',
      },
      {
        name: 'harness imports application agent package',
        pattern:
          /from\s+['"](?:agent-|example-agent-)[^'"]+['"]|import\s+['"](?:agent-|example-agent-)[^'"]+['"]/,
        message:
          'agent-test-harness must not import agents/* or examples/agents/* packages.',
      },
      {
        name: 'harness imports runtime-events',
        pattern: importFromModule('runtime-events'),
        message:
          'agent-test-harness must not import runtime-events; callers pass knownEventTypes.',
      },
      {
        name: 'harness imports apps/worker',
        pattern: /from\s+['"]worker|import\s+['"]worker|apps\/worker/,
        message: 'agent-test-harness must not import apps/worker.',
      },
    ]);
    expect(violations).toEqual([]);
  });
});
