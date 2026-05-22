import crypto from 'node:crypto';

const SESSION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

export function validateSessionId(raw: string): string {
  const sessionId = raw.trim();
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error(`Invalid sessionId "${raw}"`);
  }
  if (sessionId.startsWith('.')) {
    throw new Error(`Invalid sessionId "${raw}"`);
  }
  return sessionId;
}

export function createInternalSessionId(): string {
  return `${new Date()
    .toISOString()
    .replace(/[:.]/g, '')
    .replace('T', '-')
    .replace('Z', '')}-${crypto.randomUUID().slice(0, 8)}`;
}
