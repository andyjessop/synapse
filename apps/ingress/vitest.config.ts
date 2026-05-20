import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'agent-reviewer': new URL(
        '../../agents/agent-reviewer/src/index.ts',
        import.meta.url,
      ).pathname,
      'example-agent-echo/ingress': new URL(
        '../../examples/agents/example-agent-echo/src/ingress.ts',
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: [
        'src/app.ts',
        'src/resolve-ingress-app-config.ts',
        'src/mount-ingress-surfaces.ts',
        'src/webhooks/webhook-route-registry.ts',
        'src/polling/**/*.ts',
        'src/routes/**/*.ts',
      ],
      exclude: ['src/main.ts', 'src/env.ts'],
      thresholds: {
        statements: 65,
        branches: 50,
        functions: 60,
        lines: 65,
      },
    },
  },
});
