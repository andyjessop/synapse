import { pollSourceIdSchema } from 'runtime-manifest';
import { z } from 'zod';

export const pollTickReasonCountsSchema = z.record(
  z.string(),
  z.number().int().nonnegative(),
);

/** One durable event id per successful root semantic emit (includes deduped existing events). */
export const pollTickSummarySchema = z
  .object({
    sourceId: pollSourceIdSchema,
    emitted: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative(),
    rootEventIds: z.array(z.string().min(1)),
    skipReasons: pollTickReasonCountsSchema.optional(),
    failureReasons: pollTickReasonCountsSchema.optional(),
  })
  .strict();

export const pollRunResponseSchema = z
  .object({
    summary: pollTickSummarySchema,
  })
  .strict();

export const pollRunErrorBodySchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  })
  .strict();

export const pollRunErrorResponseSchema = z
  .object({
    error: pollRunErrorBodySchema,
  })
  .strict();

export type PollTickSummary = z.infer<typeof pollTickSummarySchema>;
export type PollRunError = z.infer<typeof pollRunErrorBodySchema>;
export type PollRunErrorBody = z.infer<typeof pollRunErrorResponseSchema>;
