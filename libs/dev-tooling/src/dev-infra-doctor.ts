import { createConnection } from 'node:net';
import { Client as PgClient } from 'pg';
import { parseRuntimeConfig, type RuntimeConfig } from 'runtime-config';

export type ProbeStatus = 'ok' | 'failed';

export type ProbeResult = {
  name: string;
  status: ProbeStatus;
  message?: string;
};

export type ServiceProbe = {
  name: string;
  run: () => Promise<void>;
};

export type DoctorLogger = {
  log: (message: string) => void;
  error: (message: string) => void;
};

export type DoctorResult = {
  ok: boolean;
  results: ProbeResult[];
};

export async function runDevInfraDoctor(
  probes = createDefaultDoctorProbes(parseRuntimeConfig(process.env)),
  logger: DoctorLogger = console,
): Promise<DoctorResult> {
  const results: ProbeResult[] = [];

  for (const probe of probes) {
    try {
      await probe.run();
      results.push({ name: probe.name, status: 'ok' });
      logger.log(`ok ${probe.name}`);
    } catch (error) {
      const message = getErrorMessage(error);
      results.push({ name: probe.name, status: 'failed', message });
      logger.error(`failed ${probe.name}: ${message}`);
    }
  }

  return {
    ok: results.every((result) => result.status === 'ok'),
    results,
  };
}

export function createDefaultDoctorProbes(
  config: RuntimeConfig,
): ServiceProbe[] {
  return [
    {
      name: 'postgres',
      run: () => checkPostgres(config.databaseUrl),
    },
    {
      name: 'redis',
      run: () => checkRedis(config.redisUrl),
    },
    {
      name: 'opentelemetry-collector',
      run: () => checkHttpOk(config.otelCollectorHealthUrl),
    },
    {
      name: 'jaeger-ui',
      run: () => checkHttpOk(config.jaegerUiUrl),
    },
  ];
}

export async function checkPostgres(databaseUrl: string): Promise<void> {
  const client = new PgClient({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query('SELECT 1');
  } finally {
    await client.end();
  }
}

export function parseRedisEndpoint(redisUrl: string): {
  host: string;
  port: number;
} {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: url.port === '' ? 6379 : Number(url.port),
  };
}

export async function checkRedis(
  redisUrl: string,
  timeoutMs = 2_000,
): Promise<void> {
  const { host, port } = parseRedisEndpoint(redisUrl);

  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host, port });
    let settled = false;

    const timeout = setTimeout(() => {
      finish(new Error('Redis PING timed out'));
    }, timeoutMs);

    function finish(error?: Error): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      socket.destroy();

      if (error) {
        reject(error);
      } else {
        resolve();
      }
    }

    socket.once('error', (err) => {
      finish(err instanceof Error ? err : new Error(String(err)));
    });
    socket.once('connect', () => {
      socket.write('*1\r\n$4\r\nPING\r\n');
    });
    socket.once('data', (data) => {
      if (data.toString().startsWith('+PONG')) {
        finish();
      } else {
        finish(new Error('Redis did not return PONG'));
      }
    });
  });
}

export async function checkHttpOk(url: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
