import { describe, expect, it } from 'vitest';

import { assertDevWipeAllowed } from '../../src/assert-dev-wipe-allowed.js';

describe('assertDevWipeAllowed', () => {
  it('allows loopback hosts', () => {
    expect(() =>
      assertDevWipeAllowed(
        'postgresql://synapse:synapse@127.0.0.1:25432/synapse',
      ),
    ).not.toThrow();
    expect(() =>
      assertDevWipeAllowed('postgresql://synapse:synapse@localhost/synapse'),
    ).not.toThrow();
  });

  it('rejects remote hosts', () => {
    expect(() =>
      assertDevWipeAllowed('postgresql://user:pass@db.example.com/prod'),
    ).toThrow(/loopback Postgres/);
  });
});
