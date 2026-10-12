# legal-office

Multi-tenant modular monolith: NestJS (`apps/api`), Next.js App Router (`apps/web`),
shared TypeScript code (`packages/shared`), managed with pnpm workspaces.
PostgreSQL is the chosen database; no ORM, schema or migration exists yet.

## Requirements

- Node 22 (`.nvmrc`)
- pnpm 9.15.4 (`packageManager`; e.g. `corepack enable`)

## Run

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Development servers:

```sh
pnpm --filter @legal-office/api build && pnpm --filter @legal-office/api start   # http://localhost:3001/health
pnpm --filter @legal-office/web dev                                              # http://localhost:3000
```

`GET /health` returns `{"status":"ok"}`.

## Status

This skeleton was written without running any command. `pnpm-lock.yaml` is not
committed yet; install, lockfile generation and the checks above are verified in a
later step (coordinator + CI).

Bootstrap checks: `node --test tests/bootstrap-contract.test.mjs` and
`node scripts/check-tracked-file-safety.mjs`.
