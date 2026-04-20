import * as net from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

const pgConnect = vi.fn<() => Promise<void>>();
const pgQuery = vi.fn<(query: string) => Promise<void>>();
const pgEnd = vi.fn<() => Promise<void>>();

vi.mock('pg', () => ({
  Client: vi.fn(function Client() {
    return {
      connect: pgConnect,
      query: pgQuery,
      end: pgEnd,
    };
  }),
}));

vi.mock('node:net', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:net')>();
  return {
    ...actual,
    createConnection: vi.fn(
      (...args: Parameters<typeof actual.createConnection>) =>
        actual.createConnection(...args),
    ),
  };
});

const {
  checkHttpOk,
  checkPostgres,
  checkRedis,
  createDefaultDoctorProbes,
  getErrorMessage,
  parseRedisEndpoint,
  runDevInfraDoctor,
} = await import('../../src/dev-infra-doctor');
const { parseRuntimeConfig } = await import('runtime-config');

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  pgConnect.mockReset();
  pgQuery.mockReset();
  pgEnd.mockReset();
});

describe('runDevInfraDoctor', () => {
  it('reports successful probes', async () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    const result = await runDevInfraDoctor(
      [
        { name: 'postgres', run: async () => undefined },
        { name: 'redis', run: async () => undefined },
      ],
      logger,
    );

    expect(result).toEqual({
      ok: true,
      results: [
        { name: 'postgres', status: 'ok' },
        { name: 'redis', status: 'ok' },
      ],
    });
    expect(logger.log).toHaveBeenCalledWith('ok postgres');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('reports failed probes and keeps checking the rest', async () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    const result = await runDevInfraDoctor(
      [
        {
          name: 'postgres',
          run: async () => {
            throw new Error('down');
          },
        },
        { name: 'redis', run: async () => undefined },
      ],
      logger,
    );

    expect(result).toEqual({
      ok: false,
      results: [
        { name: 'postgres', status: 'failed', message: 'down' },
        { name: 'redis', status: 'ok' },
      ],
    });
    expect(logger.error).toHaveBeenCalledWith('failed postgres: down');
    expect(logger.log).toHaveBeenCalledWith('ok redis');
  });

  it('creates the expected default probes from runtime config', () => {
    const probes = createDefaultDoctorProbes(parseRuntimeConfig({}));

    expect(probes.map((probe) => probe.name)).toEqual([
      'postgres',
      'redis',
      'opentelemetry-collector',
      'jaeger-ui',
    ]);
  });

  it('runs the default probe callbacks against fake local services', async () => {
    const redisServer = net.createServer((socket) => {
      socket.once('data', () => socket.write('+PONG\r\n'));
    });
    await new Promise<void>((resolve) =>
      redisServer.listen(0, '127.0.0.1', resolve),
    );
    const redisAddress = redisServer.address();
    if (typeof redisAddress !== 'object' || redisAddress === null) {
      throw new Error('expected TCP address');
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200 })),
    );

    const probes = createDefaultDoctorProbes(
      parseRuntimeConfig({
        REDIS_URL: `redis://127.0.0.1:${redisAddress.port}`,
      }),
    );
    const logger = { log: vi.fn(), error: vi.fn() };
    const result = await runDevInfraDoctor(probes, logger);

    expect(result.ok).toBe(true);
    await new Promise<void>((resolve, reject) =>
      redisServer.close((error) => (error ? reject(error) : resolve())),
    );
  });
});

describe('service probes', () => {
  it('checks Postgres with SELECT 1 and closes the client', async () => {
    await checkPostgres('postgresql://user:pass@127.0.0.1:5432/app');

    expect(pgConnect).toHaveBeenCalledOnce();
    expect(pgQuery).toHaveBeenCalledWith('SELECT 1');
    expect(pgEnd).toHaveBeenCalledOnce();
  });

  it('closes Postgres even when the query fails', async () => {
    pgQuery.mockRejectedValueOnce(new Error('bad query'));

    await expect(
      checkPostgres('postgresql://user:pass@127.0.0.1:5432/app'),
    ).rejects.toThrow('bad query');
    expect(pgEnd).toHaveBeenCalledOnce();
  });

  it('checks Redis with PING/PONG', async () => {
    const server = net.createServer((socket) => {
      socket.once('data', () => socket.write('+PONG\r\n'));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (typeof address !== 'object' || address === null) {
      throw new Error('expected TCP address');
    }

    await checkRedis(`redis://127.0.0.1:${address.port}`);
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it('rejects Redis responses that are not PONG', async () => {
    const server = net.createServer((socket) => {
      socket.once('data', () => socket.write('-ERR nope\r\n'));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (typeof address !== 'object' || address === null) {
      throw new Error('expected TCP address');
    }

    await expect(
      checkRedis(`redis://127.0.0.1:${address.port}`),
    ).rejects.toThrow('Redis did not return PONG');
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it('surfaces Redis socket errors', async () => {
    await expect(checkRedis('redis://127.0.0.1:1')).rejects.toThrow();
  });

  it('ignores late socket errors after a successful Redis PONG', async () => {
    const { EventEmitter } = await import('node:events');
    const fakeSocket = Object.assign(new EventEmitter(), {
      write: vi.fn(),
      destroy: vi.fn(),
    });
    vi.mocked(net.createConnection).mockImplementationOnce(() => {
      queueMicrotask(() => {
        fakeSocket.emit('connect');
        queueMicrotask(() => {
          fakeSocket.emit('data', Buffer.from('+PONG\r\n'));
          fakeSocket.emit('error', new Error('late'));
        });
      });
      return fakeSocket as unknown as net.Socket;
    });

    await checkRedis('redis://127.0.0.1:1');

    expect(fakeSocket.destroy).toHaveBeenCalled();
  });

  it('stringifies non-Error Redis socket errors', async () => {
    const { EventEmitter } = await import('node:events');
    const fakeSocket = Object.assign(new EventEmitter(), {
      write: vi.fn(),
      destroy: vi.fn(),
    });
    vi.mocked(net.createConnection).mockImplementationOnce(() => {
      queueMicrotask(() => {
        fakeSocket.emit('error', 'not-an-error');
      });
      return fakeSocket as unknown as net.Socket;
    });

    await expect(checkRedis('redis://127.0.0.1:2')).rejects.toThrow(
      'not-an-error',
    );
  });

  it('times out Redis probes without PONG', async () => {
    let acceptedSocket: net.Socket | undefined;
    const server = net.createServer((socket) => {
      acceptedSocket = socket;
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (typeof address !== 'object' || address === null) {
      throw new Error('expected TCP address');
    }

    await expect(
      checkRedis(`redis://127.0.0.1:${address.port}`, 1),
    ).rejects.toThrow('Redis PING timed out');
    acceptedSocket?.destroy();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it('checks HTTP endpoints for successful status codes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200 })),
    );

    await checkHttpOk('http://127.0.0.1:13133/');

    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:13133/');
  });

  it('rejects HTTP endpoints with unsuccessful status codes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503 })),
    );

    await expect(checkHttpOk('http://127.0.0.1:13133/')).rejects.toThrow(
      'HTTP 503',
    );
  });
});

describe('parseRedisEndpoint', () => {
  it('defaults to port 6379 when the URL omits a port', () => {
    expect(parseRedisEndpoint('redis://127.0.0.1')).toEqual({
      host: '127.0.0.1',
      port: 6379,
    });
  });

  it('uses the explicit port when present', () => {
    expect(parseRedisEndpoint('redis://redis.local:6380')).toEqual({
      host: 'redis.local',
      port: 6380,
    });
  });
});

describe('getErrorMessage', () => {
  it('returns Error messages and stringifies non-Error values', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
    expect(getErrorMessage('plain')).toBe('plain');
  });
});
