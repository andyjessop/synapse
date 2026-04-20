import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const tempRoots: string[] = [];

function createTempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'synapse-drizzle-arch-'));
  tempRoots.push(root);
  return root;
}

function writeFile(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function listSourceFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFilesRecursive(path));
    } else if (entry.isFile() && path.endsWith('.ts')) {
      out.push(path);
    }
  }
  return out;
}

type ArchitectureRule = {
  name: string;
  pattern: RegExp;
  message: string;
};

function importFromModule(moduleName: string): RegExp {
  return new RegExp(
    `(?:from\\\\s+['\"]${moduleName}['\"]|import\\\\s+['\"]${moduleName}['\"])`,
  );
}

function findArchitectureViolations(input: {
  repoRoot: string;
  files: readonly string[];
  rules: readonly ArchitectureRule[];
}): { file: string; message: string }[] {
  const violations: { file: string; message: string }[] = [];
  for (const file of input.files) {
    const source = readFileSync(file, 'utf8');
    for (const rule of input.rules) {
      if (rule.pattern.test(source)) {
        violations.push({ file, message: rule.message });
      }
    }
  }
  return violations;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function collectMonorepoTypeScriptFiles(repoRoot: string): string[] {
  const out: string[] = [];
  for (const prefix of ['apps', 'libs'] as const) {
    const base = join(repoRoot, prefix);
    const entries = readdirSync(base, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      out.push(...listSourceFilesRecursive(join(base, entry.name)));
    }
  }
  return out;
}

describe('database client import architecture guard', () => {
  const repoRoot = join(fileURLToPath(new URL('../../../..', import.meta.url)));
  const forbiddenOrmPackage = ['drizzle', 'orm'].join('-');

  it('reports forbidden ORM imports', () => {
    const root = createTempRepo();
    const bad = join(root, 'apps', 'fake-app', 'src', 'index.ts');
    writeFile(
      bad,
      `import { sql } from "${forbiddenOrmPackage}";\nexport const x = sql\`1\`;\n`,
    );

    const violations = findArchitectureViolations({
      repoRoot: root,
      files: [bad],
      rules: [forbiddenImportRule(forbiddenOrmPackage)],
    });

    expect(violations.length).toBe(1);
  });

  it('keeps the removed ORM out of source', () => {
    const files = collectMonorepoTypeScriptFiles(repoRoot);
    const violations = findArchitectureViolations({
      repoRoot,
      files,
      rules: [forbiddenImportRule(forbiddenOrmPackage)],
    });
    expect(violations.map((v) => v.message)).toEqual([]);
  });

  it('keeps pg usage inside runtime-store and dev-tooling only', () => {
    const allowSubstrings = [
      join('libs', 'runtime-store'),
      join('libs', 'dev-tooling', 'src', 'dev-infra-doctor.ts'),
    ].map((p) => p.replaceAll('\\', '/'));

    const files = collectMonorepoTypeScriptFiles(repoRoot).filter((f) => {
      const n = f.replaceAll('\\', '/');
      if (n.endsWith('architecture-scanner.test.ts')) {
        // Fixture source strings match `importFromModule('pg')` but are not real imports.
        return false;
      }
      return !allowSubstrings.some((a) => n.includes(a));
    });

    const violations = findArchitectureViolations({
      repoRoot,
      files,
      rules: [
        {
          name: 'pg outside runtime-store',
          pattern: importFromModule('pg'),
          message:
            'pg must only be imported from libs/runtime-store and libs/dev-tooling dev-infra-doctor.',
        },
      ],
    });
    expect(violations.map((v) => v.message)).toEqual([]);
  });
});

function forbiddenImportRule(moduleName: string): ArchitectureRule {
  return {
    name: `${moduleName} forbidden`,
    pattern: importFromModule(moduleName),
    message: `${moduleName} must not be imported from source.`,
  };
}
