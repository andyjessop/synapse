import { formatPiToolActivitySummary } from '../pi-harness-tool-activity.js';

const MAX_SUMMARY_CHARS = 256;

/**
 * Low-cardinality, bounded tool args for durable events (paths/patterns only).
 */
export function sanitizePiToolArgsForEvent(
  toolName: string,
  args: unknown,
  repoRoot?: string,
): Record<string, unknown> {
  const summary = formatPiToolActivitySummary(toolName, args, repoRoot);
  const bounded =
    summary.length > MAX_SUMMARY_CHARS
      ? `${summary.slice(0, MAX_SUMMARY_CHARS - 1)}…`
      : summary;
  return { summary: bounded };
}
