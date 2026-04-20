import { createHash } from 'node:crypto';

const LOCK_PREFIX = 'synapse:agent-sqlite-lock:v1\0';

/**
 * Two signed int32 (big-endian) from SHA-256 of UTF-8(lock prefix + agentName).
 */
export function computeAgentSqliteAdvisoryLockInts(
  agentName: string,
): readonly [number, number] {
  const payload = Buffer.from(`${LOCK_PREFIX}${agentName}`, 'utf8');
  const digest = createHash('sha256').update(payload).digest();
  const a = digest.readInt32BE(0);
  const b = digest.readInt32BE(4);
  return [a, b] as const;
}
