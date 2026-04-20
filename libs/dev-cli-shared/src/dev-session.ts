import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { webhookRouteIdSchema } from 'runtime-manifest';
import { z } from 'zod';

export const devSessionSchema = z
  .object({
    manifest_path: z.string().min(1),
    manifest_name: z.string().min(1),
    webhooks: z
      .object({
        routes: z.array(webhookRouteIdSchema).min(1),
      })
      .strict(),
  })
  .strict();

export type DevSession = z.infer<typeof devSessionSchema>;

export function devSessionFilePath(repoRoot: string): string {
  return join(repoRoot, '.synapse', 'dev-session.json');
}

export function writeDevSession(repoRoot: string, session: DevSession): void {
  const path = devSessionFilePath(repoRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(session, null, 2)}\n`, 'utf8');
}

export function readDevSession(repoRoot: string): DevSession {
  const path = devSessionFilePath(repoRoot);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      'Missing .synapse/dev-session.json. Start the dev stack first: npm run dev',
    );
  }
  return devSessionSchema.parse(JSON.parse(raw) as unknown);
}
