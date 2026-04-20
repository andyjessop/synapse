import type { PoolClient } from 'pg';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function jitteredBackoffMs(attempt: number, capMs: number): number {
  const base = Math.min(2 ** Math.min(attempt, 8), capMs / 2);
  const jitter = Math.floor(Math.random() * base * 0.3);
  return Math.min(base + jitter, capMs);
}

export async function tryAcquireAgentSqliteAdvisoryLockWithTimeout(
  client: PoolClient,
  lock1: number,
  lock2: number,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    const res = await client.query(
      'select pg_try_advisory_lock($1::int, $2::int) as ok',
      [lock1, lock2],
    );
    const ok = res.rows[0]?.ok === true;
    if (ok) {
      return true;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return false;
    }
    const backoff = jitteredBackoffMs(attempt, 500);
    await sleep(Math.min(backoff, remaining));
    attempt += 1;
  }
  return false;
}

export async function releaseAgentSqliteAdvisoryLock(
  client: PoolClient,
  lock1: number,
  lock2: number,
): Promise<void> {
  await client.query('select pg_advisory_unlock($1::int, $2::int)', [
    lock1,
    lock2,
  ]);
}
