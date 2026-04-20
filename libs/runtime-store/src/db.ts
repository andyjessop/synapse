import pg from 'pg';

const { Pool } = pg;

/**
 * Postgres client for runtime-store helpers. Implementations use **`pg` `Pool` or
 * `PoolClient`** with the native driver and raw `query(sql, params)`.
 */
export type Queryable = pg.Pool | pg.PoolClient;

export type RuntimePool = pg.Pool;

export type RuntimeStoreOptions = {
  databaseUrl: string;
  max?: number;
  schema?: string;
};

export function assertSqlIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }
  return identifier;
}

export function createRuntimeStorePool(
  options: RuntimeStoreOptions,
): RuntimePool {
  const schemaOptions =
    options.schema === undefined
      ? {}
      : { options: `-c search_path=${assertSqlIdentifier(options.schema)}` };
  return new Pool({
    connectionString: options.databaseUrl,
    max: options.max ?? 10,
    ...schemaOptions,
  });
}

export async function withTransaction<T>(
  pool: RuntimePool,
  run: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await run(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      // ignore rollback errors while handling the original failure
    }
    throw error;
  } finally {
    client.release();
  }
}
