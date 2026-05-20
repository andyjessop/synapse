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

function piToolCallEventDetail(
  event: DevOnceRunRecordEvent,
): string | undefined {
  if (
    event.type !== 'pi.tool-call.started.v1' &&
    event.type !== 'pi.tool-call.completed.v1'
  ) {
    return undefined;
  }
  const data =
    event.data !== null && typeof event.data === 'object'
      ? (event.data as Record<string, unknown>)
      : undefined;
  if (data === undefined) {
    return undefined;
  }
  const args =
    data.args !== null && typeof data.args === 'object'
      ? (data.args as Record<string, unknown>)
      : undefined;
  const summary =
    typeof args?.summary === 'string' ? args.summary.trim() : undefined;
  const resultSummary =
    typeof data.result_summary === 'string'
      ? data.result_summary.trim()
      : undefined;
  const bits: string[] = [];
  if (summary !== undefined && summary !== '') {
    bits.push(summary);
  }
  if (resultSummary !== undefined && resultSummary !== '') {
    bits.push(`→ ${resultSummary}`);
  }
  return bits.length > 0 ? bits.join(' ') : undefined;
}

export function formatRunGraphEventLine(
  event: DevOnceRunRecordEvent,
  options?: { branchPrefix?: string },
): string {
  const prefix = options?.branchPrefix ?? '';
  const piDetail = piToolCallEventDetail(event);
  const typeLabel =
    piDetail !== undefined
      ? `${color.green(event.type)}  ${color.dim(piDetail)}`
      : color.green(event.type);
  return `${prefix}${color.green('◇')}  ${typeLabel}    ${event.id}`;
}

export function formatRunGraphAgentRunLine(
  run: DevOnceRunRecordAgentRun,
  options?: { branchPrefix?: string },
): string {
  const prefix = options?.branchPrefix ?? '';
  return `${prefix}${color.cyan('▶')}  ${color.cyan(`${run.agentName} / ${run.reactorName}`)}  ${formatRunGraphStatusGlyph(run.status)}    ${run.id}`;
}
