/**
 * Fallback ref when no env override is set (mutable tag — override with digest in production).
 * Build locally: `bun run docker:build-shadow-node-runner` from the monorepo root.
 */
export const DEFAULT_SHADOW_NODE_RUNNER_IMAGE_REF =
  'deus/shadow-node-runner:20-alpine' as const;

/** @deprecated Use {@link DEFAULT_SHADOW_NODE_RUNNER_IMAGE_REF} */
export const DEFAULT_SHADOW_NODE_RUNNER_IMAGE_TAG =
  DEFAULT_SHADOW_NODE_RUNNER_IMAGE_REF;

function defaultNodeRunnerRefFromDigestEnv(): string | undefined {
  const raw = process.env.SHADOW_GIT_BRIDGE_NODE_IMAGE_DIGEST?.trim();
  if (!raw) {
    return undefined;
  }
  const digest = raw.startsWith('sha256:') ? raw : `sha256:${raw}`;
  if (!/^sha256:[a-f0-9]{64}$/i.test(digest)) {
    return undefined;
  }
  return `deus/shadow-node-runner@${digest}`;
}

/**
 * Resolves the Docker image used for `node-runner` sessions (shadow prep + coding).
 * Precedence: `SHADOW_GIT_BRIDGE_NODE_IMAGE` → `ORACLE_PREP_DOCKER_IMAGE` → `LABORATORY_DOCKER_IMAGE` → digest from `SHADOW_GIT_BRIDGE_NODE_IMAGE_DIGEST` (immutable) → {@link DEFAULT_SHADOW_NODE_RUNNER_IMAGE_REF}.
 */
export function resolveShadowNodeRunnerImageRef(): string {
  return (
    process.env.SHADOW_GIT_BRIDGE_NODE_IMAGE ??
    process.env.ORACLE_PREP_DOCKER_IMAGE ??
    process.env.LABORATORY_DOCKER_IMAGE ??
    defaultNodeRunnerRefFromDigestEnv() ??
    DEFAULT_SHADOW_NODE_RUNNER_IMAGE_REF
  );
}
