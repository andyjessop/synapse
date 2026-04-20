import { describe, expect, it } from 'vitest';
import { createWebhooksApp } from '../../src/app';

describe('prs route validation', () => {
  it('returns 415 for non-JSON content type', async () => {
    const pool = { query: async () => ({ rows: [] }) } as never;
    const { app } = createWebhooksApp({ pool });
    const response = await app.request('/v1/prs', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'hello',
    });
    expect(response.status).toBe(415);
  });
});
