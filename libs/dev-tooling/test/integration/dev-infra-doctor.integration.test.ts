import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { checkHttpOk, runDevInfraDoctor } from '../../src/dev-infra-doctor';

async function withHttpServer(
  statusCode: number,
  test: (url: string) => Promise<void>,
): Promise<void> {
  const server = createServer((_req, res) => {
    res.writeHead(statusCode);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    throw new Error('expected TCP address');
  }

  try {
    await test(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

describe('dev infra doctor integration behavior', () => {
  it('checks fake HTTP service endpoints successfully', async () => {
    await withHttpServer(200, async (url) => {
      const logger = { log: vi.fn(), error: vi.fn() };
      const result = await runDevInfraDoctor(
        [{ name: 'fake-http', run: () => checkHttpOk(url) }],
        logger,
      );

      expect(result.ok).toBe(true);
      expect(result.results).toEqual([{ name: 'fake-http', status: 'ok' }]);
    });
  });

  it('returns failed status for down or unhealthy fake endpoints', async () => {
    await withHttpServer(503, async (url) => {
      const logger = { log: vi.fn(), error: vi.fn() };
      const result = await runDevInfraDoctor(
        [{ name: 'fake-http', run: () => checkHttpOk(url) }],
        logger,
      );

      expect(result.ok).toBe(false);
      expect(result.results).toEqual([
        { name: 'fake-http', status: 'failed', message: 'HTTP 503' },
      ]);
    });
  });
});
