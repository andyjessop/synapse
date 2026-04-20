import type {
  PiReviewClient,
  PiReviewRequest,
  PiReviewResult,
} from 'agent-reviewer';
import {
  findAdapterFixtureMatch,
  type PiReviewAdapterFixture,
} from 'runtime-manifest';

export type CreatePiReviewMockClientInput = {
  repoRoot: string;
  rules: readonly PiReviewAdapterFixture[];
};

export function createPiReviewMockClient(
  input: CreatePiReviewMockClientInput,
): PiReviewClient {
  return {
    repoRoot: input.repoRoot,
    review: async (request: PiReviewRequest): Promise<PiReviewResult> => {
      const rule = findAdapterFixtureMatch(input.rules, {
        projectId: request.gitlab.projectId,
        mergeRequestIid: request.gitlab.mergeRequestIid,
        subject: request.subject,
        inputEventId: request.inputEventId,
      });
      if (rule === undefined) {
        throw new Error(
          `No adapter fixture match for pi.review (projectId=${request.gitlab.projectId}, mergeRequestIid=${request.gitlab.mergeRequestIid}). Loaded ${input.rules.length} rule(s).`,
        );
      }
      const markdown = rule.response.markdown;
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
