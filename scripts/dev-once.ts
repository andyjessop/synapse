import { runDevOnceCli } from './dev-once/run.js';

runDevOnceCli(process.argv.slice(2), import.meta.url)
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
