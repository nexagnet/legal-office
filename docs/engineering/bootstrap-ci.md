# Private repository bootstrap CI — R3 review notes

Canonical: [legal-office #2](https://github.com/nexagnet/legal-office/issues/2)
Parent: [org .github #14](https://github.com/nexagnet/.github/issues/14)

## Purpose (not application CI)

This staged workflow adds only **bootstrap-level** GitHub Actions on PRs targeting `main` and on merges pushed to `main`. It validates its own least-privilege source contract and rejects common sensitive filenames in tracked Git files. GitHub-hosted Ubuntu/Node requires no repo secrets or external package install.

- Workflow: `.github/workflows/ci.yml` — display name must stay `ci`: the central Reviewer requires a trusted `pull_request` run with `.name == "ci"` and `.path == ".github/workflows/ci.yml"`. Do not rename.
- Required job candidates: `bootstrap-verify` and `bootstrap-safety`; **DO NOT register required checks/rulesets yet without R3 authorization and real run evidence.**
- Token: `contents: read`; checkout `persist-credentials: false`; no OAuth, GitHub App private key, id-token, publish or merge permission.
- No cross-repo event processing or remote calls; no automatic `@claude` response.
- No business rules, customer files, database migrations, production deployment or existing transport V4 workflows are imported.

## Exact-head checkout: PR HEAD vs synthetic merge commit

For `pull_request` events, `actions/checkout` without `ref` checks out `refs/remotes/pull/<n>/merge`, a **synthetic merge commit** GitHub creates from the PR HEAD and the current base branch. Its SHA differs from the PR HEAD and changes when `main` moves. A green run on it, even with `run.head_sha == PR.head_sha`, does **not** prove the tests ran on the exact PR HEAD under review.

This workflow therefore:

- sets `EXPECTED_SHA` per job to `github.event.pull_request.head.sha || github.sha` (PR HEAD on `pull_request`, the pushed commit on `push` to `main`);
- passes it as `ref:` to both `actions/checkout` steps (SHA-pinned, `persist-credentials: false`);
- right after checkout, compares `git rev-parse HEAD` with `EXPECTED_SHA` and **fails the job** on any mismatch (fail closed; no `continue-on-error`).

The job log prints `expected=<sha> actual=<sha>`; reviewers must read it rather than rely on `run.head_sha`. Mergeability against the latest `main` is a separate concern covered by branch/merge rules and the exact-`main` run after merge.

## Proof and limits

1. Verify Draft PR exact HEAD and that its new bootstrap workflow is actually scheduled on `pull_request`; success requires **both** named bootstrap jobs green at the same HEAD.
2. Independent source security review, then **R3 owner-controlled merge**; verify actual merge SHA and run both jobs on exact `main`.
3. **NOT ACTIVE** for AI coding. Central Builder [PR #2](https://github.com/nexagnet/.github/pull/2) and Reviewer [PR #6](https://github.com/nexagnet/.github/pull/6) still need independent R3 approval and owner merge, plus verified App/OAuth credential path. Add tightly scoped consumer caller workflow in a later R3 PR.
4. This CI does **not** verify TypeScript, Next.js, NestJS, pnpm lockfile, Prisma/Drizzle, tenancy, access controls, legal roles, application vulnerabilities or runtime. A real application scaffold must extend the CI before any feature is considered accepted.
5. The tracked filename guard is not a secret-content scan. Preserve manual data governance and human approval.

## Stop conditions

- GitHub connection refuses protected `.github/workflows` edits, workflow cannot run on this private repository, or repository permission/secret settings require elevation.
- No self-approval, no bypass of branch protection, no R3 auto-merge or production.
