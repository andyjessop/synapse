import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

const piHarnessFixtureSchema = z
  .object({
    markdown: z.string().min(1),
  })
  .strict();

export type PiHarnessFixture = z.infer<typeof piHarnessFixtureSchema>;

export function loadPiHarnessFixture(
  repoRoot: string,
  relativePath: string,
): PiHarnessFixture {
  const raw = JSON.parse(
    readFileSync(join(repoRoot, relativePath), 'utf8'),
  ) as unknown;
  return piHarnessFixtureSchema.parse(raw);
}
