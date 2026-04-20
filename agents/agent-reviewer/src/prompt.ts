import type { SynapseEvent } from 'runtime-agent';

import type { PrReceivedData } from './pr-received-data.js';

export const REVIEW_PR_PROMPT_VERSION = 'review-pr.v2' as const;

export function buildReviewPrPrompt(input: {
  event: SynapseEvent<PrReceivedData>;
  repoRoot: string;
}): string {
  const { event, repoRoot } = input;
  const data = event.data;
  const changeLines = Object.entries(data.changes).map(
    ([field, change]) =>
      `- ${field}: ${JSON.stringify(change.previous)} -> ${JSON.stringify(change.current)}`,
  );
  const changesBlock =
    changeLines.length > 0 ? changeLines.join('\n') : '- (none reported)';

  return [
    'You are reviewing a GitLab merge request.',
    '',
    `Repository root (local checkout for extra context): ${repoRoot}`,
    `Project: ${data.project.path_with_namespace} (project_id=${data.project.id})`,
    `Merge request: iid=${data.merge_request.iid} (internal id=${data.merge_request.id})`,
    `Merge request URL: ${data.merge_request.url}`,
    `Title: ${data.merge_request.title}`,
    `Description: ${data.merge_request.description}`,
    `Source branch: ${data.merge_request.source_branch}`,
    `Target branch: ${data.merge_request.target_branch}`,
    `Last commit SHA: ${data.merge_request.last_commit_sha}`,
    ...(data.merge_request.oldrev === undefined
      ? []
      : [`Previous revision: ${data.merge_request.oldrev}`]),
    '',
    'Changed fields (webhook metadata only):',
    changesBlock,
    '',
    'Authoritative code changes for this MR come from the tool fetch_merge_request_diff.',
    `Call fetch_merge_request_diff once with project_id=${data.project.id} and merge_request_iid=${data.merge_request.iid} before writing findings.`,
    'Do not assume the local checkout matches the MR branch state in development.',
    'You may use read/grep/find/ls on the checkout for supporting context only.',
    'Focus on correctness, regressions, missing tests, security, and observability.',
    '',
    'Return Markdown with these sections exactly:',
    '## Summary',
    '## Findings',
    '## Tests',
    '## Residual Risk',
  ].join('\n');
}

export function extractReviewSummary(markdown: string): string {
  const fromSection = firstLineUnderHeading(markdown, 'Summary');
  if (fromSection !== undefined) {
    return fromSection.slice(0, 500);
  }
  const firstLine = markdown
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return (firstLine ?? 'Review completed').slice(0, 500);
}

export function countReviewFindings(markdown: string): number {
  const section = sectionBody(markdown, 'Findings');
  if (section === undefined) {
    return 0;
  }
  if (/no findings/i.test(section)) {
    return 0;
  }
  let count = 0;
  for (const line of section.split('\n')) {
    const trimmed = line.trim();
    if (/^#{1,6}\s/.test(trimmed)) {
      break;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      count += 1;
    }
  }
  return count;
}

function firstLineUnderHeading(
  markdown: string,
  heading: string,
): string | undefined {
  const body = sectionBody(markdown, heading);
  if (body === undefined) {
    return undefined;
  }
  return body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
}

function sectionBody(markdown: string, heading: string): string | undefined {
  const pattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, 'im');
  const match = pattern.exec(markdown);
  if (match === null || match.index === undefined) {
    return undefined;
  }
  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const nextHeading = rest.search(/^##\s+/m);
  return (nextHeading === -1 ? rest : rest.slice(0, nextHeading)).trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
