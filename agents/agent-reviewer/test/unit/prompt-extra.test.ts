import { describe, expect, it } from 'vitest';
import { extractReviewSummary } from '../../src/prompt';

describe('extractReviewSummary fallbacks', () => {
  it('uses the first markdown line when Summary is missing', () => {
    expect(extractReviewSummary('First line only\n\n## Other')).toBe(
      'First line only',
    );
  });

  it('returns a default when markdown is empty', () => {
    expect(extractReviewSummary('   \n  ')).toBe('Review completed');
  });
});
