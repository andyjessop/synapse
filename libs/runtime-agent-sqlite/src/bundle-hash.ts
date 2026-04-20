import { createHash } from 'node:crypto';

/**
 * UTF-8 NFC, LF, trim trailing whitespace per line, then exactly one trailing
 * newline (strip trailing empty lines first — section 5b).
 */
export function normalizeMigrationSqlForHash(sql: string): string {
  const nfc = sql.normalize('NFC');
  const lf = nfc.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const lines = lf.split('\n').map((line) => line.replace(/\s+$/u, ''));
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return `${lines.join('\n')}\n`;
}

export function computeNormalizedMigrationSqlHash(sql: string): string {
  const normalized = normalizeMigrationSqlForHash(sql);
  const digest = createHash('sha256').update(normalized, 'utf8').digest('hex');
  return `sha256:${digest}`;
}

export function computeMigrationBundleHash(
  migrations: readonly { id: string; hash: string }[],
): string {
  const parts: string[] = ['agent-sqlite-bundle-v1\n'];
  for (const m of migrations) {
    parts.push(`${m.id}\n${m.hash}\n\n`);
  }
  const payload = parts.join('');
  const digest = createHash('sha256').update(payload, 'utf8').digest('hex');
  return `sha256:${digest}`;
}
