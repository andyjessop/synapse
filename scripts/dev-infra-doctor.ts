import { join } from 'node:path';
import { createDefaultDoctorProbes, runDevInfraDoctor } from 'dev-tooling';
import {
  getRepoRoot,
  loadDotEnvLocal,
  parseRuntimeConfig,
} from 'runtime-config';

async function main(): Promise<void> {
  const repoRoot = getRepoRoot(import.meta.url);
  const env = loadDotEnvLocal(join(repoRoot, '.env.local'), process.env);
  const result = await runDevInfraDoctor(
    createDefaultDoctorProbes(parseRuntimeConfig(env)),
  );

  if (result.ok) {
    console.log('Local infrastructure healthy.');
  } else {
    console.error('Local infrastructure has failing services.');
    console.error(
      'Code defaults already match the host ports in `local/docker-compose.yml`. If you have an `.env.local` (or shell exports) overriding `DATABASE_URL`, `REDIS_URL`, `OTEL_*`, or `JAEGER_*`, remove those lines so the defaults apply. Postgres "password authentication failed" usually means one of those URLs still targets another server (e.g. host port 5432).',
    );
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
