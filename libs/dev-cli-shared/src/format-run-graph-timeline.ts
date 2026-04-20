import type { RunGraphTimelineItem } from './compare-run-graph-timeline.js';
import {
  formatRunGraphAgentRunLine,
  formatRunGraphEventLine,
} from './run-graph-line-format.js';

/** Flat timeline view: one terminal line per event or agent run. */
export function formatRunGraphTimelineLines(
  items: readonly RunGraphTimelineItem[],
): string[] {
  return items.map((item) =>
    item.kind === 'event'
      ? formatRunGraphEventLine(item.event)
      : formatRunGraphAgentRunLine(item.run),
  );
}
