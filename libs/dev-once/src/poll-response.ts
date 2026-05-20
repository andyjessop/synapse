export function extractPollEmitCount(summary: unknown): number {
  if (
    typeof summary === 'object' &&
    summary !== null &&
    'emitted' in summary &&
    typeof (summary as { emitted: number }).emitted === 'number'
  ) {
    return (summary as { emitted: number }).emitted;
  }
  return 0;
}

export function extractPollRootEventId(summary: unknown): string | undefined {
  if (
    typeof summary !== 'object' ||
    summary === null ||
    !('rootEventIds' in summary) ||
    !Array.isArray((summary as { rootEventIds: unknown }).rootEventIds)
  ) {
    return undefined;
  }
  const ids = (summary as { rootEventIds: unknown[] }).rootEventIds.filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  );
  return ids[0];
}
