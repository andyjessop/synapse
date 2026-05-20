/**
 * Refuse wiping non-local databases (dev:once:clean).
 */
export function assertDevWipeAllowed(databaseUrl: string): void {
  let host: string;
  try {
    const normalized = databaseUrl.replace(/^postgresql:/i, 'postgres:');
    host = new URL(normalized).hostname.trim().toLowerCase();
  } catch {
    throw new Error(
      `Cannot parse DATABASE_URL for dev:once:clean safety check: ${databaseUrl}`,
    );
  }
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    throw new Error(
      `dev:once:clean only wipes loopback Postgres (127.0.0.1, localhost, ::1); got host "${host}". Use dev:infra:reset for a full volume reset.`,
    );
  }
}
