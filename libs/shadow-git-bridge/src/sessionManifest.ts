import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { SessionCheckpoint, SessionInfo, SessionManifest } from './types';

function manifestsDir(shadowRootPath: string): string {
  return path.join(shadowRootPath, 'manifests');
}

export function worktreesDir(shadowRootPath: string): string {
  return path.join(shadowRootPath, 'worktrees');
}

export function manifestPathForSession(
  shadowRootPath: string,
  internalSessionId: string,
): string {
  return path.join(manifestsDir(shadowRootPath), `${internalSessionId}.json`);
}

export async function ensureShadowRootLayout(
  shadowRootPath: string,
): Promise<void> {
  await fs.mkdir(manifestsDir(shadowRootPath), { recursive: true });
  await fs.mkdir(worktreesDir(shadowRootPath), { recursive: true });
}

export async function readSessionManifest(
  manifestPath: string,
): Promise<SessionManifest | null> {
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    return JSON.parse(raw) as SessionManifest;
  } catch {
    return null;
  }
}

export async function writeSessionManifest(
  manifestPath: string,
  manifest: SessionManifest,
): Promise<void> {
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

export async function removeSessionManifest(
  manifestPath: string,
): Promise<void> {
  await fs.rm(manifestPath, { force: true });
}

export async function listSessionManifestPaths(
  shadowRootPath: string,
): Promise<string[]> {
  try {
    const entries = await fs.readdir(manifestsDir(shadowRootPath));
    return entries
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => path.join(manifestsDir(shadowRootPath), entry));
  } catch {
    return [];
  }
}

export async function findManifestBySessionId(
  shadowRootPath: string,
  sessionId: string,
): Promise<SessionManifest | null> {
  for (const entryPath of await listSessionManifestPaths(shadowRootPath)) {
    const manifest = await readSessionManifest(entryPath);
    if (manifest?.sessionId === sessionId && manifest.status !== 'destroyed') {
      return manifest;
    }
  }
  return null;
}

export function sessionFromManifest(manifest: SessionManifest): SessionInfo {
  const { status: _status, checkpoints: _checkpoints, ...session } = manifest;
  return session;
}

export function nextCheckpointRef(
  session: SessionInfo,
  sequence: number,
): string {
  return `refs/deus-shadow/checkpoints/${session.internalSessionId}/${sequence
    .toString()
    .padStart(6, '0')}`;
}

export function nextSemanticRef(session: SessionInfo, label: string): string {
  return `refs/deus-shadow/semantic/${session.internalSessionId}/${sanitizeRefSegment(
    label,
  )}`;
}

export function createBaseCheckpoint(session: SessionInfo): SessionCheckpoint {
  return {
    sequence: 0,
    hash: session.baseCommitHash,
    ref: session.currentCheckpointRef,
    label: 'base',
    kind: 'base',
    createdAt: session.createdAt,
  };
}

function sanitizeRefSegment(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return sanitized.length > 0 ? sanitized : 'checkpoint';
}
