import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
  PiReviewClient,
  PiReviewRequest,
  PiReviewResult,
} from 'agent-reviewer';

export type CreatePiReviewFixtureClientInput = {
  repoRoot: string;
  fixtureFile: string;
};

export function createPiReviewFixtureClient(
  input: CreatePiReviewFixtureClientInput,
): PiReviewClient {
  const fixturePath = join(input.repoRoot, input.fixtureFile);

  return {
    repoRoot: input.repoRoot,
    review: async (_request: PiReviewRequest): Promise<PiReviewResult> => {
      const markdown = await readFile(fixturePath, 'utf8');
      return {
        markdown,
        command: 'fixture',
        cwd: input.repoRoot,
        exitCode: 0,
        durationMs: 0,
        stdoutBytes: Buffer.byteLength(markdown, 'utf8'),
        stderrBytes: 0,
      };
    },
  };
}
