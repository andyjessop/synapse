import color from 'picocolors';

import type {
  DevOnceRunRecordAgentRun,
  DevOnceRunRecordEvent,
} from './run-record.js';

export function formatRunGraphStatusGlyph(status: string): string {
  if (status === 'succeeded') {
    return color.green('✓');
  }
  if (status === 'failed') {
    return color.red('✗');
  }
  return color.yellow(status);
}

export function formatRunGraphEventLine(
  event: DevOnceRunRecordEvent,
  options?: { branchPrefix?: string },
): string {
  const prefix = options?.branchPrefix ?? '';
  return `${prefix}${color.green('◇')}  ${color.green(event.type)}    ${event.id}`;
}

export function formatRunGraphAgentRunLine(
  run: DevOnceRunRecordAgentRun,
  options?: { branchPrefix?: string },
): string {
  const prefix = options?.branchPrefix ?? '';
  return `${prefix}${color.cyan('▶')}  ${color.cyan(`${run.agentName} / ${run.reactorName}`)}  ${formatRunGraphStatusGlyph(run.status)}    ${run.id}`;
}
