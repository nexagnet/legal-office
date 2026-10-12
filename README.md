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

The skeleton was written without a shell. The coordinator then added the root `package.json`, bumped
dependencies to audit-clean versions and committed `pnpm-lock.yaml`, and verified locally: install, lint,
typecheck, test, build, format check and `pnpm audit --audit-level high` all pass. CI for these checks
is added separately (R3, Issue #37).
