import type { GitLabMrChanges } from 'adapter-gitlab';

const MAX_SINGLE_FILE_DIFF_BYTES = 32 * 1024;
const MAX_TOTAL_OUTPUT_BYTES = 96 * 1024;
const TRUNCATED_FILE_SUFFIX = '\n<!-- truncated -->';

export function formatMrChangesAsMarkdown(changes: GitLabMrChanges): string {
  const header = `# Merge request changes (project_id=${changes.project_id}, iid=${changes.merge_request_iid})\n\n`;
  let output = header;
  let omitted = 0;

  for (const file of changes.changes) {
    const path = file.new_path || file.old_path;
    let diff = file.diff;
    if (Buffer.byteLength(diff, 'utf8') > MAX_SINGLE_FILE_DIFF_BYTES) {
      diff = `${truncateUtf8(diff, MAX_SINGLE_FILE_DIFF_BYTES)}${TRUNCATED_FILE_SUFFIX}`;
    }
    const section = `## ${path}\n\`\`\`diff\n${diff}\n\`\`\`\n\n`;
    if (Buffer.byteLength(output + section, 'utf8') > MAX_TOTAL_OUTPUT_BYTES) {
      omitted += 1;
      continue;
    }
    output += section;
  }

  if (omitted > 0) {
    output += `<!-- truncated: ${omitted} more files -->\n`;
  }

  return output.trimEnd();
}

function truncateUtf8(text: string, maxBytes: number): string {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) {
    return text;
  }
  let end = text.length;
  while (end > 0 && Buffer.byteLength(text.slice(0, end), 'utf8') > maxBytes) {
    end -= 1;
  }
  return text.slice(0, end);
}
