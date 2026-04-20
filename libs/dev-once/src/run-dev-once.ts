import { join } from 'node:path';

import {
  createRootGraphObserver,
  findLatestDevRunSnapshotRelativePath,
  readDevSession,
  resolveRootGraphWaitPollParams,
  retryDevFailedRunsOnRoot,
  waitForLatestDevRunSnapshotRelativePath,
} from 'dev-cli-shared';
import { loadDotEnvLocal, parseRuntimeConfig } from 'runtime-config';
import {
  parseRuntimeManifestFile,
  type RuntimeManifest,
} from 'runtime-manifest';
import { createRuntimeStorePool, selectEventById } from 'runtime-store';
import {
  parseSynapseFixtureFile,
  readWebhookBodyBytes,
  resolveFixtureById,
  type SynapseFixture,
} from 'synapse-fixtures';

import type { SynapseRunArtifact } from './artifact-schema.js';
import { buildSynapseRunArtifact } from './build-artifact.js';
import { waitForFixtureTerminal } from './terminal.js';
import { uniquifyGitLabMergeRequestWebhookBody } from './uniquify-pr-fixture.js';
import {
  assertLoopbackWebhooksHost,
  buildWebhooksBaseUrl,
  parseAcceptedWebhookJson,
  postWebhookFixture,
} from './webhook-post.js';

export type RunDevOnceOptions = {
  repoRoot: string;
  fixtureId: string;
  fixturePath?: string;
  timeoutMs?: number;
  pollMs?: number;
  noWait?: boolean;
  /**
   * When true (default for interactive CLI), poll Postgres during the wait and
   * emit new timeline lines via `onLiveGraphLine` (events and agent runs as they land).
   */
  liveGraph?: boolean;
  /** Called for each new formatted timeline line when `liveGraph` is true. */
  onLiveGraphLine?: (line: string) => void;
  env?: Record<string, string | undefined>;
};

function resolvePollParams(options: RunDevOnceOptions): {
  pollMs: number;
  timeoutMs: number | undefined;
} {
  const env = options.env ?? process.env;
  const defaults = resolveRootGraphWaitPollParams(env);
  return {
    pollMs: options.pollMs ?? defaults.pollMs,
    timeoutMs: options.timeoutMs ?? defaults.maxMs,
  };
}

function loadManifestFromSession(repoRoot: string) {
  const session = readDevSession(repoRoot);
  const manifest = parseRuntimeManifestFile(session.manifest_path);
  return {
    manifestPath: session.manifest_path,
    manifestName: session.manifest_name,
    manifest,
  };
}

function resolveFixture(
  options: RunDevOnceOptions,
  manifest: RuntimeManifest,
): { fixture: SynapseFixture; fixturePath: string } {
  if (options.fixturePath !== undefined) {
    const fixture = parseSynapseFixtureFile(
      options.repoRoot,
      options.fixturePath,
    );
    return { fixture, fixturePath: options.fixturePath };
  }

  const resolved = resolveFixtureById(
    manifest,
    options.repoRoot,
    options.fixtureId,
  );
  return {
    fixture: resolved.fixture,
    fixturePath: resolved.path,
  };
}

function parseWebhookTargetFromEnv(env: Record<string, string | undefined>): {
  WEBHOOKS_HOST: string;
  WEBHOOKS_PORT: number;
} {
  const host = env.WEBHOOKS_HOST?.trim() || '127.0.0.1';
  const portRaw = env.WEBHOOKS_PORT?.trim() || '3102';
  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid WEBHOOKS_PORT: ${portRaw}`);
  }
  return { WEBHOOKS_HOST: host, WEBHOOKS_PORT: port };
}

export async function runDevOnce(
  options: RunDevOnceOptions,
): Promise<SynapseRunArtifact> {
  const env = loadDotEnvLocal(
    join(options.repoRoot, '.env.local'),
    options.env ?? process.env,
  );
  const config = parseRuntimeConfig(env);
  const pgSchema = env.SYNAPSE_PG_SCHEMA?.trim();
  const pool = createRuntimeStorePool({
    databaseUrl: config.databaseUrl,
    max: 4,
    ...(pgSchema !== undefined && pgSchema !== '' ? { schema: pgSchema } : {}),
  });

  try {
    const { manifestPath, manifestName, manifest } = loadManifestFromSession(
      options.repoRoot,
    );
    const { fixture, fixturePath } = resolveFixture(options, manifest);
    const { pollMs, timeoutMs } = resolvePollParams(options);

    const parsed = parseWebhookTargetFromEnv(env);
    assertLoopbackWebhooksHost(parsed.WEBHOOKS_HOST);
    const webhooksBase = buildWebhooksBaseUrl(
      parsed.WEBHOOKS_HOST,
      parsed.WEBHOOKS_PORT,
    );

    let body = readWebhookBodyBytes(options.repoRoot, fixture.ingress);
    if (fixture.ingress.path === '/v1/prs') {
      body = uniquifyGitLabMergeRequestWebhookBody(body);
    }

    const post = await postWebhookFixture({
      baseUrl: webhooksBase,
      fixture,
      body,
    });
    if (!post.ok) {
      throw new Error(post.error);
    }

    const accepted = parseAcceptedWebhookJson(fixture, post.json);
    if (!accepted.ok) {
      throw new Error(accepted.error);
    }

    const inputEventId = accepted.event_id;
    const event = await selectEventById(pool, inputEventId);
    if (event === undefined) {
      throw new Error(`No durable event for ${inputEventId}`);
    }

    await retryDevFailedRunsOnRoot({
      pool,
      redisUrl: config.redisUrl,
      rootId: event.rootId,
    });

    const useLiveGraph =
      options.liveGraph === true &&
      !options.noWait &&
      options.onLiveGraphLine !== undefined;
    const liveObserver = useLiveGraph ? createRootGraphObserver() : undefined;

    const terminal = options.noWait
      ? ({ kind: 'succeeded' } as const)
      : await waitForFixtureTerminal({
          pool,
          rootId: event.rootId,
          fixture,
          pollMs,
          timeoutMs,
          onPollTick:
            liveObserver === undefined
              ? undefined
              : async () => {
                  const lines = await liveObserver.poll(pool, event.rootId);
                  for (const line of lines) {
                    options.onLiveGraphLine?.(line);
                  }
                },
        });

    const graphSnapshotPath = options.noWait
      ? findLatestDevRunSnapshotRelativePath(options.repoRoot, inputEventId)
      : await waitForLatestDevRunSnapshotRelativePath(
          options.repoRoot,
          inputEventId,
          { pollMs: 500, maxPolls: 60 },
        );

    return await buildSynapseRunArtifact({
      pool,
      manifestName,
      manifestPath,
      fixture,
      fixturePath,
      inputEvent: event,
      terminal,
      graphSnapshotPath: graphSnapshotPath ?? undefined,
    });
  } finally {
    await pool.end();
  }
}
