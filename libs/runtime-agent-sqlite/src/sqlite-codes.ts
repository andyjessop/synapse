/** Walk `Error` / `cause` chain for better-sqlite3 `code` (e.g. `SQLITE_CORRUPT`). */
export function readSqliteErrorCode(error: unknown): string | undefined {
  let cur: unknown = error;
  for (
    let depth = 0;
    depth < 8 && cur !== undefined && cur !== null;
    depth += 1
  ) {
    if (
      typeof cur === 'object' &&
      cur !== null &&
      'code' in cur &&
      typeof (cur as { code: unknown }).code === 'string'
    ) {
      return (cur as { code: string }).code;
    }
    if (cur instanceof Error && 'cause' in cur) {
      cur = (cur as Error & { cause?: unknown }).cause;
      continue;
    }
    break;
  }
  return undefined;
}
