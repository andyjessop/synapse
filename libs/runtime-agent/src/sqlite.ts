export type SqliteMigration = {
  id: string;
  hash: string;
  sql: string;
};

export type AgentSqliteDefinition = {
  /** Applied in array order exactly as given. */
  migrations: readonly SqliteMigration[];
};

export type SqliteExecResult = {
  /** From `better-sqlite3` `Statement.run` `changes` for that statement. */
  rowsWritten: number;
  lastInsertRowid?: number | bigint;
};

export type AgentSqliteDb = {
  exec(sql: string, params?: readonly unknown[]): Promise<SqliteExecResult>;
  one<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<T | undefined>;
  all<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
    options?: { maxRows?: number },
  ): Promise<T[]>;
};
