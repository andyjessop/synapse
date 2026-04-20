/** Strip leading ASCII whitespace, line comments (`--`), and block comments. */
export function stripLeadingForFirstToken(sql: string): {
  readonly rest: string;
  readonly error?: 'unterminated_block_comment';
} {
  let s = sql;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    s = s.replace(/^[\t\n\r ]+/u, '');
    if (s.startsWith('--')) {
      const nl = s.indexOf('\n');
      if (nl === -1) {
        s = '';
      } else {
        s = s.slice(nl + 1);
      }
      continue;
    }
    if (s.startsWith('/*')) {
      const end = s.indexOf('*/', 2);
      if (end === -1) {
        return { rest: '', error: 'unterminated_block_comment' };
      }
      s = s.slice(end + 2);
      continue;
    }
    return { rest: s };
  }
}

export function readFirstSqlIdentifier(rest: string): string | undefined {
  const m = /^([A-Za-z_][\w$]*)/u.exec(rest);
  return m?.[1];
}

export function firstTokenIsForbiddenConnectionKeyword(sql: string): boolean {
  const stripped = stripLeadingForFirstToken(sql);
  if (stripped.error !== undefined) {
    return false;
  }
  const id = readFirstSqlIdentifier(stripped.rest);
  if (id === undefined) {
    return false;
  }
  const lower = id.toLowerCase();
  return lower === 'pragma' || lower === 'attach' || lower === 'detach';
}

const RESERVED = '__agent_sqlite_';

export function containsReservedAgentSqliteTable(sql: string): boolean {
  return sql.toLowerCase().includes(RESERVED);
}

const TX_TOKEN =
  /\b(begin(\s+immediate|\s+deferred|\s+exclusive)?|commit|savepoint|rollback)\b/giu;

export function migrationSqlContainsTransactionControl(sql: string): boolean {
  TX_TOKEN.lastIndex = 0;
  return TX_TOKEN.test(sql);
}
