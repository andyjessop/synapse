import { createHash } from 'node:crypto';
import { join } from 'node:path';

export const AGENT_NAME_SLUG_PATTERN = /^[a-z][a-z0-9-]*$/;

export function assertAgentNameSqliteSlug(agentName: string): void {
  if (!AGENT_NAME_SLUG_PATTERN.test(agentName)) {
    throw new Error(
      `Agent name must match ${AGENT_NAME_SLUG_PATTERN} for SQLite paths: ${agentName}`,
    );
  }
}

export function shortHashForAgentName(agentName: string): string {
  const digest = createHash('sha256').update(agentName, 'utf8').digest('hex');
  return digest.slice(0, 16);
}

export function resolveAgentSqliteFilePath(
  baseDir: string,
  agentName: string,
): string {
  assertAgentNameSqliteSlug(agentName);
  const short = shortHashForAgentName(agentName);
  return join(baseDir, `${agentName}--${short}.sqlite`);
}
