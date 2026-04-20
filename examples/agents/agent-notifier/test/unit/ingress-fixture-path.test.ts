import { describe, expect, it } from 'vitest';

import { resolveIngressFixturePath } from '../../src/ingress.js';

describe('resolveIngressFixturePath', () => {
  it('joins repo-relative fixture paths to repoRoot', () => {
    expect(
      resolveIngressFixturePath(
        '/repo',
        'examples/fixtures/agent-notifier/ticket-opened.json',
        'default.json',
      ),
    ).toBe('/repo/examples/fixtures/agent-notifier/ticket-opened.json');
  });

  it('uses default when fixtureFile is undefined', () => {
    expect(
      resolveIngressFixturePath('/repo', undefined, 'examples/a.json'),
    ).toBe('/repo/examples/a.json');
  });

  it('leaves absolute fixture paths unchanged', () => {
    expect(
      resolveIngressFixturePath('/repo', '/tmp/ticket.json', 'examples/a.json'),
    ).toBe('/tmp/ticket.json');
  });
});
