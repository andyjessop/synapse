const EVENT_ID_PATTERN = /^evt_[0-9a-f]{32}$/;

/** Local-time `YYYYMMDDHHmmss` so `tmp/dev/runs` artifacts sort chronologically. */
export function formatDevArtifactTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    String(date.getFullYear()) +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

export function formatDevJsonFileBody(value: unknown): string {
  return `${JSON.stringify(value, undefined, 2)}\n`;
}

export function devRunSnapshotArtifactFileName(
  inputEventId: string,
  writtenAt: Date = new Date(),
): string {
  assertDevArtifactEventId(inputEventId);
  return `${formatDevArtifactTimestamp(writtenAt)}_${inputEventId}.json`;
}

export function assertDevArtifactEventId(eventId: string): void {
  if (!EVENT_ID_PATTERN.test(eventId)) {
    throw new Error('invalid event id for dev artifact file');
  }
}
