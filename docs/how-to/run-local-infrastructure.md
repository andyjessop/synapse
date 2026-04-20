---
title: Run local infrastructure
kind: how-to
owner: runtime
status: current
updated: 2026-05-16
freshness_triggers:
  - local/docker-compose.yml
  - scripts/dev-infra-doctor.ts
---

# Run local infrastructure

## Goal

Start, verify, stop, or reset the local Docker stack (Postgres, Redis, OpenTelemetry Collector, Jaeger).

## Before You Start

- Docker installed and running
- Shell at the repository root

## Steps

1. Start containers and wait for health:

```bash
npm run dev:infra
```

2. Verify reachability:

```bash
npm run dev:infra:doctor
```

3. Stop containers (keep volumes):

```bash
npm run dev:infra:down
```

4. Stop and delete volumes:

```bash
npm run dev:infra:reset
```

## Verify

`dev:infra:doctor` exits 0 when services respond on the documented host ports. See [Environment](../reference/environment.md).

## Troubleshooting

- **Port conflicts:** Local stack uses non-default ports (`25432`, `26379`, `24317`, etc.) so another Postgres/Redis on default ports does not block Synapse.
- **Docker not running:** Start Docker Desktop or the Docker daemon before `dev:infra`.
