export function buildIngressBaseUrl(host: string, port: number): string {
  return `http://${host}:${port}`;
}

export function parseIngressTargetFromEnv(
  env: Record<string, string | undefined>,
): {
  INGRESS_HOST: string;
  INGRESS_PORT: number;
} {
  const host =
    env.INGRESS_HOST?.trim() || env.WEBHOOKS_HOST?.trim() || '127.0.0.1';
  const portRaw =
    env.INGRESS_PORT?.trim() || env.WEBHOOKS_PORT?.trim() || '3102';
  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid ingress port: ${portRaw}`);
  }
  return { INGRESS_HOST: host, INGRESS_PORT: port };
}

export function assertLoopbackIngressHost(host: string): void {
  const normalized = host.trim().toLowerCase();
  if (
    normalized !== '127.0.0.1' &&
    normalized !== 'localhost' &&
    normalized !== '::1'
  ) {
    throw new Error(`dev:once must target loopback ingress (got ${host})`);
  }
}
