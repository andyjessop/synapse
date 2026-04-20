import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PI_REVIEW_MODEL,
  parsePiReviewModelString,
} from '../../src/pi-review-model';

describe('parsePiReviewModelString', () => {
  it('defaults to openai/gpt-5.4-mini', () => {
    expect(parsePiReviewModelString(undefined)).toEqual({
      provider: 'openai',
      modelId: 'gpt-5.4-mini',
    });
    expect(parsePiReviewModelString('   ')).toEqual({
      provider: 'openai',
      modelId: 'gpt-5.4-mini',
    });
  });

  it('parses provider and model id', () => {
    expect(parsePiReviewModelString('openai/gpt-4o-mini')).toEqual({
      provider: 'openai',
      modelId: 'gpt-4o-mini',
    });
  });

  it('rejects invalid shape', () => {
    expect(() => parsePiReviewModelString('no-slash')).toThrow();
  });

  it('exports default constant', () => {
    expect(DEFAULT_PI_REVIEW_MODEL).toBe('openai/gpt-5.4-mini');
  });
});
