import { describe, expect, it } from 'vitest';

import { GitLabApiError } from '../../src/client.js';

describe('GitLabApiError', () => {
  it('exposes status and name', () => {
    const error = new GitLabApiError('not found', 404);
    expect(error.name).toBe('GitLabApiError');
    expect(error.status).toBe(404);
    expect(error.message).toBe('not found');
  });
});
