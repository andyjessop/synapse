import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { AssistantMessageEvent } from '@earendil-works/pi-ai';
import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';

import {
  formatPiToolActivitySummary,
  truncateVisible,
} from './pi-harness-tool-activity';

const PREFIX = '[pi-harness]' as const;
const THINKING_LOG_INTERVAL_MS = 750;
const DEFAULT_SNAPSHOT_LINE_COUNT = 3;

export type PiHarnessProgressSession = {
  subscribe(listener: (event: AgentSessionEvent) => void): () => void;
};

export type PiHarnessProgressStreamState = {
  lastThinkingLogAt: number;
};

export function isPiHarnessProgressEnabled(
  env: NodeJS.ProcessEnv | undefined,
): boolean {
  if (env === undefined) {
    return false;
  }
  const raw = env.PI_HARNESS_PROGRESS?.trim().toLowerCase();
  if (raw === undefined || raw === '') {
    return false;
  }
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') {
    return false;
  }
  return (
    raw === '1' ||
    raw === 'true' ||
    raw === 'yes' ||
    raw === 'stderr' /* explicit stderr sink; see subscribe + dev-once */
  );
}

/** Progress lines written for dev-once Clack (atomic JSON, last N activity lines). */
export type PiHarnessProgressSnapshotV1 = {
  lines: string[];
};

function normalizeFsPath(p: string): string {
  return p.replaceAll('\\', '/');
}

/** Strip repo-root absolute prefixes from a line (thinking text may embed paths). */
export function relativizeRepoPrefixesInLine(
  line: string,
  repoRoot?: string,
): string {
  if (repoRoot === undefined || repoRoot === '') {
    return line;
  }
  const r = normalizeFsPath(repoRoot).replace(/\/$/, '');
  if (r === '') {
    return line;
  }
  const withSlash = `${r}/`;
  let out = line;
  while (out.includes(withSlash)) {
    out = out.split(withSlash).join('');
  }
  if (out === r) {
    return '.';
  }
  return out;
}

export function stripPiHarnessProgressPrefix(line: string): string {
  const head = `${PREFIX} `;
  return line.startsWith(head) ? line.slice(head.length) : line;
}

export function writePiHarnessProgressSnapshot(
  filePath: string,
  lines: readonly string[],
): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const payload = `${JSON.stringify({ lines: [...lines] } satisfies PiHarnessProgressSnapshotV1)}\n`;
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, payload, 'utf8');
  renameSync(tmp, filePath);
}

function formatThinkingProgressLine(
  assistantMessageEvent: AssistantMessageEvent,
  streamState: PiHarnessProgressStreamState,
  nowMs: number,
  repoRoot?: string,
): string | undefined {
  if (assistantMessageEvent.type !== 'thinking_delta') {
    return undefined;
  }
  const delta =
    typeof assistantMessageEvent.delta === 'string'
      ? assistantMessageEvent.delta
      : '';
  if (delta.trim() === '') {
    return undefined;
  }
  if (nowMs - streamState.lastThinkingLogAt < THINKING_LOG_INTERVAL_MS) {
    return undefined;
  }
  streamState.lastThinkingLogAt = nowMs;
  const visible = truncateVisible(delta, 96);
  const body = relativizeRepoPrefixesInLine(visible, repoRoot);
  return `${PREFIX} thinking ${body}`;
}

/**
 * Maps Pi `AgentSessionEvent` values to single-line stderr progress: tool use
 * with paths/patterns, throttled thinking deltas, and tool failures only.
 */
export function formatPiHarnessProgressLine(
  event: AgentSessionEvent,
  streamState: PiHarnessProgressStreamState,
  nowMs: number,
  repoRoot?: string,
): string | undefined {
  if (typeof event !== 'object' || event === null || !('type' in event)) {
    return undefined;
  }
  const { type } = event;
  switch (type) {
    case 'tool_execution_start': {
      const toolName = 'toolName' in event ? String(event.toolName) : '?';
      const args = 'args' in event ? event.args : undefined;
      return `${PREFIX} ${formatPiToolActivitySummary(toolName, args, repoRoot)}`;
    }
    case 'tool_execution_end': {
      if (!('isError' in event) || event.isError !== true) {
        return undefined;
      }
      const toolName = 'toolName' in event ? String(event.toolName) : '?';
      const args = 'args' in event ? event.args : undefined;
      return `${PREFIX} ${formatPiToolActivitySummary(toolName, args, repoRoot)} failed`;
    }
    case 'message_update': {
      if (
        !('assistantMessageEvent' in event) ||
        event.assistantMessageEvent === undefined
      ) {
        return undefined;
      }
      return formatThinkingProgressLine(
        event.assistantMessageEvent as AssistantMessageEvent,
        streamState,
        nowMs,
        repoRoot,
      );
    }
    default:
      return undefined;
  }
}

export function subscribePiHarnessProgress(
  session: PiHarnessProgressSession,
  options: {
    enabled: boolean;
    emitLine: (line: string) => void;
    snapshotPath?: string;
    /** Rolling window size for `snapshotPath` (default 3). */
    snapshotLineCount?: number;
    repoRoot?: string;
    now?: () => number;
  },
): () => void {
  if (!options.enabled) {
    return () => {};
  }
  const now = options.now ?? (() => Date.now());
  const streamState: PiHarnessProgressStreamState = {
    lastThinkingLogAt: -THINKING_LOG_INTERVAL_MS,
  };
  let lastEmitted: string | undefined;
  const snapshotPath = options.snapshotPath?.trim();
  const useSnapshot = snapshotPath !== undefined && snapshotPath !== '';
  const maxSnap = options.snapshotLineCount ?? DEFAULT_SNAPSHOT_LINE_COUNT;
  const ring: string[] = [];
  return session.subscribe((event) => {
    const line = formatPiHarnessProgressLine(
      event,
      streamState,
      now(),
      options.repoRoot,
    );
    if (line === undefined || line === lastEmitted) {
      return;
    }
    lastEmitted = line;
    if (useSnapshot) {
      const path = snapshotPath as string;
      const display = relativizeRepoPrefixesInLine(
        stripPiHarnessProgressPrefix(line),
        options.repoRoot,
      );
      ring.push(display);
      while (ring.length > maxSnap) {
        ring.shift();
      }
      writePiHarnessProgressSnapshot(path, ring);
      return;
    }
    options.emitLine(line);
  });
}
