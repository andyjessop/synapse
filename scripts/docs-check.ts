import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

export type DocsCheckSeverity = 'error' | 'warning';

export type DocsCheckIssue = {
  severity: DocsCheckSeverity;
  file: string;
  message: string;
};

export type DocsCheckResult = {
  rootDir: string;
  checkedFiles: number;
  issues: DocsCheckIssue[];
};

const DOCS_OWNER = z.enum([
  'repo',
  'runtime',
  'runtime-events',
  'runtime-agent',
  'runtime-store',
  'runtime-observability',
  'runtime-llm',
  'worker',
  'pi',
  'docs',
]);

const DOCS_KIND = z.enum([
  'tutorial',
  'how-to',
  'explanation',
  'reference',
  'adr',
]);

const DOCS_STATUS = z.enum(['draft', 'current', 'deprecated']);

const frontmatterSchema = z
  .object({
    title: z.string().min(1),
    kind: DOCS_KIND,
    owner: DOCS_OWNER,
    status: DOCS_STATUS,
    updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    freshness_triggers: z.array(z.string().min(1)),
  })
  .strict();

const CATEGORY_DIRS = [
  'tutorials',
  'how-to',
  'explanation',
  'reference',
  'adr',
] as const;

const REQUIRED_SECTIONS: Record<string, readonly string[]> = {
  tutorial: [
    'What You Will Build',
    'Prerequisites',
    'Steps',
    'Verify It Worked',
    'What You Learned',
    'Next Steps',
  ],
  'how-to': ['Goal', 'Before You Start', 'Steps', 'Verify', 'Troubleshooting'],
  explanation: [
    'Purpose',
    'Mental Model',
    'How It Works',
    'Boundaries',
    'Trade-Offs',
    'Related Reference',
  ],
  reference: ['Scope', 'Contract', 'Details', 'Examples', 'Related Pages'],
  adr: ['Status', 'Context', 'Decision', 'Consequences', 'Related'],
};

const ROOT_INDEX_SECTIONS = [
  'Start Here',
  'Choose The Right Doc',
  'Tutorials',
  'How-To Guides',
  'Explanation',
  'Reference',
  'ADRs',
  'Maintainers',
];

const CATCH_ALL_SECTIONS = [
  'Reference',
  'Tutorial',
  'How-To',
  'Explanation',
  'Tutorials',
  'How-To Guides',
];

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;

const MARKDOWN_LINK = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function slugifyHeading(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseFrontmatter(raw: string): {
  frontmatter: z.infer<typeof frontmatterSchema> | null;
  body: string;
  error?: string;
} {
  if (!raw.startsWith('---\n')) {
    return { frontmatter: null, body: raw, error: 'missing frontmatter' };
  }
  const end = raw.indexOf('\n---\n', 4);
  if (end === -1) {
    return { frontmatter: null, body: raw, error: 'unclosed frontmatter' };
  }
  const yamlBlock = raw.slice(4, end);
  const body = raw.slice(end + 5);
  try {
    const parsed = parseSimpleYaml(yamlBlock);
    const result = frontmatterSchema.safeParse(parsed);
    if (!result.success) {
      return {
        frontmatter: null,
        body,
        error: result.error.issues.map((i) => i.message).join('; '),
      };
    }
    return { frontmatter: result.data, body };
  } catch (e) {
    return {
      frontmatter: null,
      body,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentArrayKey: string | null = null;
  for (const line of yaml.split('\n')) {
    const trimmed = line.trimEnd();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const arrayMatch = /^(\s+)-\s+(.+)$/.exec(line);
    if (arrayMatch && currentArrayKey) {
      const items = result[currentArrayKey];
      if (!Array.isArray(items)) {
        throw new Error(`expected array for ${currentArrayKey}`);
      }
      items.push(unquote(arrayMatch[2].trim()));
      continue;
    }
    const kv = /^(\w+):\s*(.*)$/.exec(trimmed);
    if (!kv) {
      throw new Error(`invalid yaml line: ${trimmed}`);
    }
    const [, key, value] = kv;
    if (value === '') {
      currentArrayKey = key;
      result[key] = [];
    } else {
      currentArrayKey = null;
      result[key] = unquote(value.trim());
    }
  }
  return result;
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function extractHeadings(body: string): { h1: string | null; h2: string[] } {
  let h1: string | null = null;
  const h2: string[] = [];
  for (const line of body.split('\n')) {
    if (line.startsWith('# ') && h1 === null) {
      h1 = line.slice(2).trim();
    } else if (line.startsWith('## ')) {
      h2.push(line.slice(3).trim());
    }
  }
  return { h1, h2 };
}

function buildHeadingSlugMap(h2: string[]): Map<string, string[]> {
  const counts = new Map<string, number>();
  const slugs: string[] = [];
  for (const heading of h2) {
    const base = slugifyHeading(heading);
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    slugs.push(count === 0 ? base : `${base}-${count}`);
  }
  const bySlug = new Map<string, string[]>();
  for (let i = 0; i < h2.length; i++) {
    const slug = slugs[i];
    const list = bySlug.get(slug) ?? [];
    list.push(h2[i]);
    bySlug.set(slug, list);
  }
  return bySlug;
}

function expectedKindForFile(
  relativePath: string,
): z.infer<typeof DOCS_KIND> | 'root-reference' {
  if (relativePath === 'README.md') return 'root-reference';
  const parts = relativePath.split('/');
  const category = parts[0];
  if (category === 'tutorials') return 'tutorial';
  if (category === 'how-to') return 'how-to';
  if (category === 'explanation') return 'explanation';
  if (category === 'reference') return 'reference';
  if (category === 'adr') return 'adr';
  return 'reference';
}

function isIndexFile(relativePath: string): boolean {
  return path.basename(relativePath) === 'README.md';
}

async function walkMarkdownFiles(docsDir: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(dir: string, prefix: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, rel);
      } else if (entry.name.endsWith('.md')) {
        files.push(rel);
      }
    }
  }
  await walk(docsDir, '');
  return files.sort();
}

function issue(
  file: string,
  message: string,
  severity: DocsCheckSeverity = 'error',
): DocsCheckIssue {
  return { severity, file, message };
}

function extractMarkdownLinks(
  body: string,
): Array<{ text: string; target: string; index: number }> {
  const links: Array<{ text: string; target: string; index: number }> = [];
  for (const match of body.matchAll(MARKDOWN_LINK)) {
    const text = match[1] ?? '';
    const target = match[2] ?? '';
    links.push({ text, target, index: match.index ?? 0 });
  }
  return links;
}

function surroundingContext(body: string, index: number): string {
  const start = Math.max(0, index - 120);
  const end = Math.min(body.length, index + 120);
  return body.slice(start, end);
}

export async function checkDocs(rootDir: string): Promise<DocsCheckResult> {
  const issues: DocsCheckIssue[] = [];
  const docsDir = path.join(rootDir, 'docs');

  let docsStat: Awaited<ReturnType<typeof stat>>;
  try {
    docsStat = await stat(docsDir);
  } catch {
    return {
      rootDir,
      checkedFiles: 0,
      issues: [issue('docs/', 'docs/ directory does not exist')],
    };
  }
  if (!docsStat.isDirectory()) {
    return {
      rootDir,
      checkedFiles: 0,
      issues: [issue('docs/', 'docs/ is not a directory')],
    };
  }

  for (const category of CATEGORY_DIRS) {
    const categoryPath = path.join(docsDir, category);
    try {
      const s = await stat(categoryPath);
      if (!s.isDirectory()) {
        issues.push(issue('docs/', `missing category directory: ${category}`));
      }
    } catch {
      issues.push(issue('docs/', `missing category directory: ${category}`));
    }
  }

  const indexPaths = [
    'README.md',
    ...CATEGORY_DIRS.map((c) => `${c}/README.md`),
  ];
  for (const indexPath of indexPaths) {
    try {
      await stat(path.join(docsDir, indexPath));
    } catch {
      issues.push(issue(`docs/${indexPath}`, 'missing required index file'));
    }
  }

  const relativeFiles = await walkMarkdownFiles(docsDir);
  const fileContents = new Map<
    string,
    {
      body: string;
      frontmatter: z.infer<typeof frontmatterSchema> | null;
      h1: string | null;
      h2: string[];
    }
  >();

  for (const rel of relativeFiles) {
    const fullPath = path.join(docsDir, rel);
    const raw = await readFile(fullPath, 'utf8');
    if (raw.trim() === '') {
      issues.push(issue(`docs/${rel}`, 'file is empty'));
      continue;
    }

    const baseName = path.basename(rel);
    if (baseName !== 'README.md' && !KEBAB_CASE.test(baseName)) {
      issues.push(
        issue(
          `docs/${rel}`,
          `filename must be lowercase kebab-case: ${baseName}`,
        ),
      );
    }

    const { frontmatter, body, error } = parseFrontmatter(raw);
    if (error || !frontmatter) {
      issues.push(issue(`docs/${rel}`, error ?? 'invalid frontmatter'));
      continue;
    }

    const { h1, h2 } = extractHeadings(body);
    fileContents.set(rel, { body, frontmatter, h1, h2 });

    if (h1 !== frontmatter.title) {
      issues.push(
        issue(
          `docs/${rel}`,
          `first H1 "${h1 ?? ''}" must match frontmatter title "${frontmatter.title}"`,
        ),
      );
    }

    const expected = expectedKindForFile(rel);
    if (expected === 'root-reference') {
      if (frontmatter.kind !== 'reference') {
        issues.push(
          issue(
            `docs/${rel}`,
            'docs/README.md frontmatter kind must be reference',
          ),
        );
      }
    } else if (frontmatter.kind !== expected) {
      issues.push(
        issue(
          `docs/${rel}`,
          `frontmatter kind "${frontmatter.kind}" does not match folder (expected ${expected})`,
        ),
      );
    }

    if (!ISO_DATE.test(frontmatter.updated)) {
      issues.push(issue(`docs/${rel}`, 'updated must be YYYY-MM-DD'));
    }

    if (isIndexFile(rel)) {
      if (
        frontmatter.freshness_triggers.length !== 1 ||
        frontmatter.freshness_triggers[0] !== 'docs/**'
      ) {
        issues.push(
          issue(
            `docs/${rel}`,
            'index pages must use freshness_triggers: ["docs/**"]',
          ),
        );
      }
    } else if (frontmatter.freshness_triggers.length === 0) {
      issues.push(
        issue(`docs/${rel}`, 'non-index pages require freshness_triggers'),
      );
    }

    if (rel === 'README.md') {
      for (const section of ROOT_INDEX_SECTIONS) {
        if (!h2.includes(section)) {
          issues.push(
            issue(`docs/${rel}`, `missing required section: ## ${section}`),
          );
        }
      }
    } else if (!isIndexFile(rel)) {
      const sections = REQUIRED_SECTIONS[frontmatter.kind];
      for (const section of sections) {
        if (!h2.includes(section)) {
          issues.push(
            issue(`docs/${rel}`, `missing required section: ## ${section}`),
          );
        }
      }
    }

    if (!isIndexFile(rel)) {
      for (const catchAll of CATCH_ALL_SECTIONS) {
        if (h2.includes(catchAll)) {
          issues.push(
            issue(`docs/${rel}`, `forbidden catch-all section: ## ${catchAll}`),
          );
        }
      }
    }

    if (
      frontmatter.kind === 'adr' &&
      !isIndexFile(rel) &&
      h1 &&
      !/^ADR \d{4}:/.test(h1)
    ) {
      issues.push(issue(`docs/${rel}`, 'ADR H1 must match "ADR NNNN: Title"'));
    }

    const links = extractMarkdownLinks(body);
    for (const link of links) {
      const { text, target, index } = link;
      if (target.startsWith('http://') || target.startsWith('https://')) {
        continue;
      }
      if (target.startsWith('/')) {
        issues.push(
          issue(`docs/${rel}`, `absolute path link not allowed: ${target}`),
        );
        continue;
      }
      if (target.includes('specs/') || target.includes('../specs/')) {
        const context =
          `${text} ${surroundingContext(body, index)}`.toLowerCase();
        if (
          !context.includes('spec') &&
          !context.includes('implementation') &&
          !context.includes('background')
        ) {
          issues.push(
            issue(
              `docs/${rel}`,
              `spec links must mention spec, implementation, or background near the link`,
            ),
          );
        }
      }
    }
  }

  const slugMaps = new Map<string, Map<string, string[]>>();
  for (const [rel, { h2 }] of fileContents) {
    slugMaps.set(rel, buildHeadingSlugMap(h2));
  }

  for (const [rel, { body }] of fileContents) {
    const links = extractMarkdownLinks(body);
    const sourceDir = path.dirname(rel);
    for (const link of links) {
      const { target } = link;
      if (target.startsWith('http://') || target.startsWith('https://')) {
        continue;
      }
      const [filePart, fragment] = target.split('#');
      const resolved = path.normalize(path.join(sourceDir, filePart));
      if (resolved.startsWith('..') && !resolved.startsWith('../specs')) {
        if (!filePart.startsWith('../') && !filePart.startsWith('../../')) {
          // allow links outside docs only to specs with framing rules
        }
      }
      const targetRel = resolved.replace(/\\/g, '/');
      if (targetRel.startsWith('../specs/')) {
        continue;
      }
      if (!targetRel.endsWith('.md')) {
        issues.push(
          issue(`docs/${rel}`, `internal link must target .md: ${target}`),
        );
        continue;
      }
      const targetContent = fileContents.get(targetRel);
      if (!targetContent) {
        issues.push(
          issue(`docs/${rel}`, `broken link to missing file: ${target}`),
        );
        continue;
      }
      if (fragment) {
        const slugMap = slugMaps.get(targetRel);
        if (!slugMap?.has(fragment)) {
          issues.push(
            issue(
              `docs/${rel}`,
              `broken heading fragment #${fragment} in ${target}`,
            ),
          );
        }
      }
    }
  }

  const rootReadme = fileContents.get('README.md');
  if (rootReadme) {
    for (const category of CATEGORY_DIRS) {
      const indexTarget = `${category}/README.md`;
      if (
        !rootReadme.body.includes(`](${indexTarget})`) &&
        !rootReadme.body.includes(`](${category}/README.md)`)
      ) {
        issues.push(
          issue(
            'docs/README.md',
            `must link to category index: ${indexTarget}`,
          ),
        );
      }
    }
  }

  for (const category of CATEGORY_DIRS) {
    const categoryPages = relativeFiles.filter(
      (f) => f.startsWith(`${category}/`) && !isIndexFile(f),
    );
    const indexRel = `${category}/README.md`;
    const indexContent = fileContents.get(indexRel);
    if (!indexContent) continue;
    for (const page of categoryPages) {
      const pageName = path.basename(page);
      if (
        !indexContent.body.includes(`](${pageName})`) &&
        !indexContent.body.includes(`](${page})`)
      ) {
        issues.push(
          issue(
            `docs/${indexRel}`,
            `category index must link to page: ${page}`,
          ),
        );
      }
    }
  }

  return {
    rootDir,
    checkedFiles: relativeFiles.length,
    issues,
  };
}

export function formatDocsCheckIssues(result: DocsCheckResult): string {
  return result.issues
    .map((i) => `${i.severity} ${i.file}: ${i.message}`)
    .join('\n');
}

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const result = await checkDocs(rootDir);
  if (result.issues.length === 0) {
    console.log(`docs-check: checked ${result.checkedFiles} files, no issues`);
    process.exit(0);
  }
  console.log(formatDocsCheckIssues(result));
  process.exit(1);
}

import { fileURLToPath } from 'node:url';

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
