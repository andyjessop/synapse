import type {
  PiReviewClient,
  PiReviewRequest,
  PiReviewResult,
} from 'agent-reviewer';

export type CreatePiReviewMockClientInput = {
  repoRoot: string;
  markdown: string;
};

export function createPiReviewMockClient(
  input: CreatePiReviewMockClientInput,
): PiReviewClient {
  return {
    repoRoot: input.repoRoot,
    review: async (_request: PiReviewRequest): Promise<PiReviewResult> => {
      const markdown = input.markdown;
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
