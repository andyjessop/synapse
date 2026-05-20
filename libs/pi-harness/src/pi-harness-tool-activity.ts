const DEFAULT_MAX_PATH = 72;
const DEFAULT_MAX_PATTERN = 48;

function pickString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const t = value.trim();
  return t === '' ? undefined : t;
}

function pickRecord(args: unknown): Record<string, unknown> {
  return args !== null && typeof args === 'object'
    ? (args as Record<string, unknown>)
    : {};
}

/** If `path` is under `repoRoot`, return a repo-relative POSIX path; else unchanged. */
export function toRepoRelativePath(path: string, repoRoot?: string): string {
  if (repoRoot === undefined || repoRoot === '') {
    return path;
  }
  const p = path.replaceAll('\\', '/');
  const r = repoRoot.replaceAll('\\', '/').replace(/\/$/, '');
  if (p === r) {
    return '.';
  }
  if (p.startsWith(`${r}/`)) {
    return p.slice(r.length + 1);
  }
  return path;
}

/** Shorten a repo-relative or absolute path for progress lines (no secrets). */
export function ellipsizePath(path: string, max = DEFAULT_MAX_PATH): string {
  const norm = path.replaceAll('\\', '/');
  if (norm.length <= max) {
    return norm;
  }
  return `…${norm.slice(-(max - 1))}`;
}

export function truncateVisible(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) {
    return oneLine;
  }
  return `${oneLine.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * One-line description of a Pi tool invocation for progress output (paths /
 * patterns only; bounded length).
 */
export function formatPiToolActivitySummary(
  toolName: string,
  args: unknown,
  repoRoot?: string,
): string {
  const a = pickRecord(args);
  switch (toolName) {
    case 'read': {
      const path = pickString(a.path);
      return path
        ? `read ${ellipsizePath(toRepoRelativePath(path, repoRoot))}`
        : 'read';
    }
    case 'grep': {
      const pattern = pickString(a.pattern);
      const path = pickString(a.path);
      const glob = pickString(a.glob);
      const bits: string[] = [];
      if (pattern !== undefined) {
        bits.push(truncateVisible(pattern, DEFAULT_MAX_PATTERN));
      }
      if (path !== undefined) {
        bits.push(`in ${ellipsizePath(toRepoRelativePath(path, repoRoot))}`);
      }
      if (glob !== undefined) {
        bits.push(`glob ${truncateVisible(glob, 36)}`);
      }
      return bits.length > 0 ? `grep ${bits.join(' ')}` : 'grep';
    }
    case 'find': {
      const pattern = pickString(a.pattern);
      const path = pickString(a.path);
      const bits: string[] = [];
      if (pattern !== undefined) {
        bits.push(truncateVisible(pattern, DEFAULT_MAX_PATTERN));
      }
      if (path !== undefined) {
        bits.push(`under ${ellipsizePath(toRepoRelativePath(path, repoRoot))}`);
      }
      return bits.length > 0 ? `find ${bits.join(' ')}` : 'find';
    }
    case 'ls': {
      const path = pickString(a.path);
      return path
        ? `ls ${ellipsizePath(toRepoRelativePath(path, repoRoot))}`
        : 'ls .';
    }
    case 'bash': {
      const command = pickString(a.command);
      return command
        ? `bash ${truncateVisible(command, DEFAULT_MAX_PATTERN)}`
        : 'bash';
    }
    case 'write': {
      const path = pickString(a.path);
      const content = pickString(a.content);
      const pathPart = path
        ? ellipsizePath(toRepoRelativePath(path, repoRoot))
        : '?';
      const bytes =
        content !== undefined ? ` (${content.length} chars)` : '';
      return `write ${pathPart}${bytes}`;
    }
    case 'edit': {
      const path = pickString(a.path);
      const edits = a.edits;
      const editCount = Array.isArray(edits) ? edits.length : undefined;
      const pathPart = path
        ? ellipsizePath(toRepoRelativePath(path, repoRoot))
        : '?';
      return editCount !== undefined
        ? `edit ${pathPart} (${editCount} patch${editCount === 1 ? '' : 'es'})`
        : `edit ${pathPart}`;
    }
    case 'fetch_merge_request_diff': {
      const projectId = a.project_id;
      const iid = a.merge_request_iid;
      if (typeof projectId === 'number' && typeof iid === 'number') {
        return `fetch_merge_request_diff project_id=${projectId} iid=${iid}`;
      }
      return 'fetch_merge_request_diff';
    }
    default:
      return toolName;
  }
}
