# legal-office

Multi-tenant modular monolith for legal office management.

Stack: TypeScript, NestJS (`apps/api`), Next.js + React (`apps/web`), PostgreSQL, pnpm workspaces.
No ORM, schema or migration is included yet (ORM decision is pending, #4).

## Layout

- `apps/api` - minimal NestJS app, `GET /health` returns `{"status":"ok"}`.
- `apps/web` - minimal Next.js App Router placeholder page with a tenant logo slot.
- `packages/shared` - shared TypeScript package (branded `TenantId`).

## Running

Requires Node 22 (`.nvmrc`) and pnpm 9.15.4 (`corepack enable`).

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format:check
```

## Status of verification

The Builder that wrote this skeleton had no shell and **has not run any command**: not
`pnpm install`, `lint`, `typecheck`, `test`, `build` or `format:check`, and not the Node tests.
No `pnpm-lock.yaml` is committed. The project coordinator generates the lockfile locally, and CI
(R3 #37) will run the checks; results belong in the PR/issue.
