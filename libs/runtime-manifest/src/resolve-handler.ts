import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { type AgentHandler, isAgentHandler } from 'runtime-agent';

import { resolveHandlerPathForImport } from './handler-path.js';

export async function importAgentHandlerModule(
  repoRoot: string,
  handlerPath: string,
  env: Record<string, string | undefined> = process.env,
): Promise<AgentHandler> {
  const absPath = resolveHandlerPathForImport(repoRoot, handlerPath, env);
  if (!existsSync(absPath)) {
    throw new Error(`Manifest handler file not found: ${handlerPath}`);
  }
  const mod: { default?: unknown } = await import(pathToFileURL(absPath).href);
  if (!isAgentHandler(mod.default)) {
    throw new Error(
      `Manifest handler default export must be a function: ${handlerPath}`,
    );
  }
  return mod.default;
}

export async function resolveManifestHandlers(
  repoRoot: string,
  handlerPaths: readonly string[],
  env: Record<string, string | undefined> = process.env,
): Promise<Map<string, AgentHandler>> {
  const unique = [...new Set(handlerPaths)];
  const resolved = new Map<string, AgentHandler>();
  for (const handlerPath of unique) {
    resolved.set(
      handlerPath,
      await importAgentHandlerModule(repoRoot, handlerPath, env),
    );
  }
  return resolved;
}
