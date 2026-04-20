import { z } from 'zod';

export const DEFAULT_PI_REVIEW_MODEL = 'openai/gpt-5.4-mini' as const;

const piReviewModelStringSchema = z
  .string()
  .regex(
    /^[a-z0-9_-]+\/[a-z0-9_.-]+$/i,
    'Expected provider/model-id, e.g. openai/gpt-5.4-mini',
  );

export function parsePiReviewModelString(value: string | undefined): {
  provider: string;
  modelId: string;
} {
  const raw = value?.trim() || DEFAULT_PI_REVIEW_MODEL;
  const parsed = piReviewModelStringSchema.parse(raw);
  const slash = parsed.indexOf('/');
  return {
    provider: parsed.slice(0, slash).toLowerCase(),
    modelId: parsed.slice(slash + 1),
  };
}
