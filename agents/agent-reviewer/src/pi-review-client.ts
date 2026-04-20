import type { PiHarnessSynapseEmit } from 'pi-harness';

export type PiReviewRequest = {
  repoRoot: string;
  prompt: string;
  promptVersion: 'review-pr.v2';
  subject: string;
  inputEventId: string;
  gitlab: {
    projectId: number;
    mergeRequestIid: number;
  };
  /** When set, Pi SDK reviews emit `pi.tool-call.*` events via the synapse-pi-dev extension. */
  emitHarnessEvent?: PiHarnessSynapseEmit;
};

export type PiReviewResult = {
  markdown: string;
  command: string;
  cwd: string;
  exitCode: number;
  durationMs: number;
  stdoutBytes: number;
  stderrBytes: number;
};

export type PiReviewClient = {
  readonly repoRoot: string;
  review(request: PiReviewRequest): Promise<PiReviewResult>;
};

export class PiReviewFailedError extends Error {
  readonly retryable = true;

  constructor(
    message: string,
    readonly exitCode: number,
    readonly stderrPreview?: string,
  ) {
    super(message);
    this.name = 'PiReviewFailedError';
  }
}

export class PiReviewTimedOutError extends Error {
  readonly retryable = true;

  constructor(message: string) {
    super(message);
    this.name = 'PiReviewTimedOutError';
  }
}

export class PiReviewUnavailableError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = 'PiReviewUnavailableError';
  }
}
