import { truncateVisible } from './pi-harness-tool-activity.js';

const MAX_RESULT_SUMMARY_CHARS = 256;

function pickRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function firstTextContent(content: unknown): string | undefined {
  if (!Array.isArray(content)) {
    return undefined;
  }
  for (const block of content) {
    const record = pickRecord(block);
    if (record.type === 'text' && typeof record.text === 'string') {
      return record.text;
    }
  }
  return undefined;
}

function readTruncationSummary(details: Record<string, unknown>): string | undefined {
  const truncation = pickRecord(details.truncation);
  if (truncation.truncated !== true) {
    return undefined;
  }
  const outputLines = truncation.outputLines;
  const totalLines = truncation.totalLines;
  if (typeof outputLines === 'number' && typeof totalLines === 'number') {
    return `read ${outputLines}/${totalLines} lines`;
  }
  if (typeof outputLines === 'number') {
    return `read ${outputLines} lines`;
  }
  return 'read truncated';
}

/**
 * Bounded one-line outcome for durable `pi.tool-call.completed.v1` events (no file bodies).
 */
export function formatPiToolResultSummary(
  toolName: string,
  result: unknown,
  isError: boolean,
): string | undefined {
  const record = pickRecord(result);
  const text = firstTextContent(record.content);
  const details = pickRecord(record.details);

  switch (toolName) {
    case 'read': {
      const fromDetails = readTruncationSummary(details);
      if (fromDetails !== undefined) {
        return fromDetails;
      }
      if (text !== undefined) {
        const lines = text.split('\n').length;
        return isError
          ? truncateVisible(text, MAX_RESULT_SUMMARY_CHARS)
          : `read ${lines} lines`;
      }
      return isError ? 'read failed' : 'read ok';
    }
    case 'bash': {
      if (isError) {
        const exit = text?.match(/Command exited with code (\d+)/)?.[1];
        if (exit !== undefined) {
          return `bash exit ${exit}`;
        }
        if (text?.includes('Command timed out')) {
          return 'bash timeout';
        }
        if (text?.includes('Command aborted')) {
          return 'bash aborted';
        }
        return truncateVisible(text ?? 'bash failed', MAX_RESULT_SUMMARY_CHARS);
      }
      const truncation = pickRecord(details.truncation);
      if (truncation.truncated === true) {
        const outputLines = truncation.outputLines;
        if (typeof outputLines === 'number') {
          return `bash ok (${outputLines} lines output, truncated)`;
        }
        return 'bash ok (truncated output)';
      }
      const lines = text?.split('\n').filter((line) => line.length > 0).length ?? 0;
      return lines > 0 ? `bash ok (${lines} lines output)` : 'bash ok (no output)';
    }
    case 'write':
      return isError
        ? truncateVisible(text ?? 'write failed', MAX_RESULT_SUMMARY_CHARS)
        : 'write ok';
    case 'edit': {
      if (isError) {
        return truncateVisible(text ?? 'edit failed', MAX_RESULT_SUMMARY_CHARS);
      }
      const firstLine = text?.split('\n').find((line) => line.trim() !== '');
      return firstLine !== undefined
        ? truncateVisible(firstLine, MAX_RESULT_SUMMARY_CHARS)
        : 'edit ok';
    }
    case 'grep':
    case 'find':
    case 'ls': {
      if (isError) {
        return truncateVisible(text ?? `${toolName} failed`, MAX_RESULT_SUMMARY_CHARS);
      }
      const lines = text?.split('\n').filter((line) => line.length > 0).length ?? 0;
      return lines > 0 ? `${toolName} ok (${lines} lines)` : `${toolName} ok`;
    }
    case 'fetch_merge_request_diff':
      return isError
        ? truncateVisible(text ?? 'fetch_merge_request_diff failed', MAX_RESULT_SUMMARY_CHARS)
        : 'fetch_merge_request_diff ok';
    default:
      if (isError) {
        return truncateVisible(text ?? `${toolName} failed`, MAX_RESULT_SUMMARY_CHARS);
      }
      return text !== undefined && text.trim() !== ''
        ? truncateVisible(text, MAX_RESULT_SUMMARY_CHARS)
        : `${toolName} ok`;
  }
}
