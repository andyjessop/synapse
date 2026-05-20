import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDevRuntimePlan, startDevRuntime } from './dev.js';

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  process.stderr.write(
    '[dev:example] Use: npm run dev -- --manifest manifests/examples/echo.json\n',
  );
  const plan = createDevRuntimePlan(process.env, import.meta.url, {
    manifestPath: 'manifests/examples/echo.json',
  });
  startDevRuntime(plan).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
