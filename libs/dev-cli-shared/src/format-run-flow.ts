import color from 'picocolors';

import { compareSynapseEventsForTimeline } from './compare-synapse-events-for-timeline.js';
import {
  formatRunGraphAgentRunLine,
  formatRunGraphEventLine,
} from './run-graph-line-format.js';
import type {
  DevOnceRunRecord,
  DevOnceRunRecordAgentRun,
  DevOnceRunRecordEvent,
} from './run-record.js';

const FLOW_RULE = '-'.repeat(56);

const LAST_ERROR_MAX = 600;

function oneLineError(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, LAST_ERROR_MAX);
}

function downstreamEvents(
  parentEventId: string,
  events: readonly DevOnceRunRecordEvent[],
): DevOnceRunRecordEvent[] {
  return events
    .filter((event) => event.parentId === parentEventId)
    .sort(compareSynapseEventsForTimeline);
}

function indexRunsByInput(
  agentRuns: readonly DevOnceRunRecordAgentRun[],
): Map<string, DevOnceRunRecordAgentRun[]> {
  const runsByInput = new Map<string, DevOnceRunRecordAgentRun[]>();
  for (const run of agentRuns) {
    const existing = runsByInput.get(run.inputEventId) ?? [];
    existing.push(run);
    runsByInput.set(run.inputEventId, existing);
  }
  for (const runs of runsByInput.values()) {
    runs.sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id),
    );
  }
  return runsByInput;
}

function renderEventFlow(
  event: DevOnceRunRecordEvent,
  runsByInput: ReadonlyMap<string, DevOnceRunRecordAgentRun[]>,
  events: readonly DevOnceRunRecordEvent[],
  prefix: string,
  isLastSibling: boolean,
  isRoot: boolean,
): string[] {
  const lines: string[] = [];
  if (isRoot) {
    lines.push(formatRunGraphEventLine(event));
  } else {
    const branch = isLastSibling ? '└─' : '├─';
    lines.push(
      formatRunGraphEventLine(event, { branchPrefix: `${prefix}${branch}` }),
    );
  }

  const childPrefix = isRoot ? '' : `${prefix}${isLastSibling ? '   ' : '│  '}`;
  const runs = runsByInput.get(event.id) ?? [];
  const children = downstreamEvents(event.id, events);

  if (runs.length === 0) {
    for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
      const child = children[childIndex]!;
      lines.push(
        ...renderEventFlow(
          child,
          runsByInput,
          events,
          childPrefix,
          childIndex === children.length - 1,
          false,
        ),
      );
    }
    return lines;
  }

  for (let runIndex = 0; runIndex < runs.length; runIndex += 1) {
    const run = runs[runIndex]!;
    const runIsLast = runIndex === runs.length - 1 && children.length === 0;
    const runBranch = runIsLast ? '└─' : '├─';
    lines.push(
      formatRunGraphAgentRunLine(run, {
        branchPrefix: `${childPrefix}${runBranch}`,
      }),
    );
    if (run.status === 'failed' && run.lastError !== undefined) {
      lines.push(
        `${childPrefix}   ${color.red(`last_error: ${oneLineError(run.lastError)}`)}`,
      );
    }
  }

  for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
    const child = children[childIndex]!;
    lines.push(
      ...renderEventFlow(
        child,
        runsByInput,
        events,
        childPrefix,
        childIndex === children.length - 1,
        false,
      ),
    );
  }

  const succeededWithoutChildren =
    runs.some((run) => run.status === 'succeeded') && children.length === 0;
  if (succeededWithoutChildren) {
    lines.push(
      `${childPrefix}└─ ${color.yellow('(no downstream events recorded)')}`,
    );
  }

  return lines;
}

export function formatRunRecordFlow(record: DevOnceRunRecord): string {
  const inputEvent = record.events.find(
    (event) => event.id === record.inputEventId,
  );
  if (inputEvent === undefined) {
    return `${color.bold('Flow')}\n${FLOW_RULE}\n${color.red('(input event missing from record)')}`;
  }

  const runsByInput = indexRunsByInput(record.agentRuns);
  const flowLines = renderEventFlow(
    inputEvent,
    runsByInput,
    record.events,
    '',
    true,
    true,
  );

  return [color.bold('Flow'), FLOW_RULE, ...flowLines].join('\n');
}

export function formatRunRecordSummary(
  record: DevOnceRunRecord,
  artifactRelativePath: string,
): string {
  const lines = [
    `${color.cyan('scenario'.padEnd(14))} ${record.scenarioId}`,
    `${color.cyan('input event'.padEnd(14))} ${record.inputEventId}`,
    `${color.cyan('root'.padEnd(14))} ${record.rootId}`,
    `${color.cyan('artifact'.padEnd(14))} ${artifactRelativePath}`,
    `${color.cyan('events'.padEnd(14))} ${String(record.events.length)}`,
    `${color.cyan('agent runs'.padEnd(14))} ${String(record.agentRuns.length)}`,
  ];
  return lines.join('\n');
}

export function formatRunRecordTerminal(
  record: DevOnceRunRecord,
  artifactRelativePath: string,
): string {
  return [
    formatRunRecordSummary(record, artifactRelativePath),
    '',
    formatRunRecordFlow(record),
  ].join('\n');
}
