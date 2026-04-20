import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function readPiReviewMarkdownFixture(fixtureDir: string): string {
  const raw = readFileSync(
    join(fixtureDir, 'adapters/pi-review-synapse.json'),
    'utf8',
  );
  const parsed = JSON.parse(raw) as { response: { markdown: string } };
  return parsed.response.markdown;
}
