import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  checkDocs,
  formatDocsCheckIssues,
  slugifyHeading,
} from '../../scripts/docs-check';

const fixturesRoot = fileURLToPath(
  new URL('../../fixtures/docs', import.meta.url),
);

function fixtureRoot(name: string): string {
  return path.join(fixturesRoot, name);
}

describe('slugifyHeading', () => {
  it('slugifies headings GitHub-style', () => {
    expect(slugifyHeading('Record Ordering')).toBe('record-ordering');
    expect(slugifyHeading('  Hello, World!  ')).toBe('hello-world');
  });
});

describe('checkDocs', () => {
  it('passes valid minimal fixture', async () => {
    const result = await checkDocs(fixtureRoot('valid'));
    expect(result.issues).toEqual([]);
    expect(result.checkedFiles).toBeGreaterThan(0);
  });

  it('fails when docs/ is missing', async () => {
    const result = await checkDocs(fixtureRoot('no-docs-dir'));
    expect(
      result.issues.some((i) => i.message.includes('does not exist')),
    ).toBe(true);
  });

  it('fails on missing frontmatter', async () => {
    const result = await checkDocs(fixtureRoot('invalid-missing-frontmatter'));
    expect(
      result.issues.some(
        (i) =>
          i.file.includes('README.md') && i.message.includes('frontmatter'),
      ),
    ).toBe(true);
  });

  it('fails on invalid owner', async () => {
    const result = await checkDocs(fixtureRoot('invalid-owner'));
    expect(result.issues.length).toBeGreaterThan(0);
    expect(
      result.issues.some(
        (i) =>
          i.message.includes('owner') ||
          i.message.includes('Invalid option') ||
          i.message.includes('invalid'),
      ),
    ).toBe(true);
  });

  it('fails when kind does not match folder', async () => {
    const result = await checkDocs(fixtureRoot('invalid-kind-mismatch'));
    expect(result.issues.some((i) => i.message.includes('kind'))).toBe(true);
  });

  it('fails when category index is missing', async () => {
    const result = await checkDocs(
      fixtureRoot('invalid-missing-category-index'),
    );
    expect(
      result.issues.some((i) => i.message.includes('missing required index')),
    ).toBe(true);
  });

  it('fails when category index omits a page link', async () => {
    const result = await checkDocs(fixtureRoot('invalid-index-missing-link'));
    expect(
      result.issues.some((i) =>
        i.message.includes('category index must link to page'),
      ),
    ).toBe(true);
  });

  it('fails on broken relative link', async () => {
    const result = await checkDocs(fixtureRoot('invalid-broken-link'));
    expect(result.issues.some((i) => i.message.includes('broken link'))).toBe(
      true,
    );
  });

  it('fails on broken heading fragment', async () => {
    const result = await checkDocs(fixtureRoot('invalid-broken-fragment'));
    expect(
      result.issues.some((i) => i.message.includes('broken heading fragment')),
    ).toBe(true);
  });

  it('fails when required section is missing', async () => {
    const result = await checkDocs(fixtureRoot('invalid-missing-section'));
    expect(
      result.issues.some((i) => i.message.includes('missing required section')),
    ).toBe(true);
  });

  it('allows valid external https links', async () => {
    const result = await checkDocs(fixtureRoot('valid-external-link'));
    expect(result.issues).toEqual([]);
  });

  it('fails on absolute /docs/ path links', async () => {
    const result = await checkDocs(fixtureRoot('invalid-absolute-link'));
    expect(
      result.issues.some((i) =>
        i.message.includes('absolute path link not allowed'),
      ),
    ).toBe(true);
  });
});

describe('formatDocsCheckIssues', () => {
  it('formats issues as lines', async () => {
    const result = await checkDocs(fixtureRoot('invalid-missing-frontmatter'));
    const text = formatDocsCheckIssues(result);
    expect(text).toContain('error');
  });
});
