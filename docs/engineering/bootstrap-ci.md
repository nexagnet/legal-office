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

## Manual V5 sandbox diagnostic (#172)

This section records the approved caller on `main`. The branch-only #175 diagnostic
below is a separate authorized experiment; its replacement caller must never merge
into `main`.

This separate caller is scoped by [legal-office #172](https://github.com/nexagnet/legal-office/issues/172)
and [central #32](https://github.com/nexagnet/.github/issues/32). It adds no application behavior.
The existing Builder, Reviewer and Repair workflow pins stay unchanged.

- Workflow: `.github/workflows/claude-sandbox-probe-caller.yml`, display name
  `Nexagnet V5 Legal Office Sandbox Probe (manual)`.
- Event: `workflow_dispatch` only, with no inputs. The job requires repository
  `nexagnet/legal-office`, actor `phungtienviet14-sketch` and `refs/heads/main`.
  The central workflow independently checks the actual default branch and actor.
- Central version: `3a68dd94b9fd927ffd97457020a197ed0423172a`, the immutable
  owner-approved PR35 merge commit. Its exact-main CI must pass before rollout.
- Permissions: read-only contents/issues/pull requests. Only the existing
  `CLAUDE_CODE_OAUTH_TOKEN` is explicitly mapped; no inherited secrets or Publisher
  credential. The central diagnostic bounds runtime to 30 minutes and serializes
  runs per consumer. It uses synthetic canaries and a runner-local loopback fixture.
- The contract tests execute in the existing `bootstrap-verify` CI job. CI validates
  caller policy and source only; it does not execute Claude or establish isolation.

After independent review, owner-controlled R3 consumer merge and exact-main consumer
CI, an explicitly authorized owner may run the workflow from `main`, for example:

```sh
gh workflow run claude-sandbox-probe-caller.yml --repo nexagnet/legal-office --ref main
```

This command starts a real Claude diagnostic using the existing account allocation.
Creating this source PR does not dispatch it. Before running, verify the current
consumer main SHA, the central pin, and the approved source. Never switch the caller
to a branch/tag, add free-form inputs, broaden egress or retry without the sandbox.

Record the consumer Actions run URL/ID and SHA, central pin, sanitized step summary
and `sandbox-probe-audit` artifact on #172 and central #32. Read the trusted verdict,
not the model's report: only `SANDBOX_NEGATIVE_PROVEN` establishes scoped Bash network,
environment and synthetic file denial. `NOT_PROVEN`, `SANDBOX_NEGATIVE_FAIL`, missing
artifacts or a failed run keep acceptance open. Never print credentials, canary values
or raw model/tool transcripts. This does not prove Read/Glob/Grep or MCP isolation,
does not enable public Internet/Figma, and does not close central #36/#37/#38.

Rollback: stop manual dispatches and remove this caller through an owner-controlled
R3 PR. Cancel an active diagnostic if needed; retain its sanitized evidence. Do not
change existing application callers, secrets or V4 fallback as part of rollback.

## Branch-only Read/Glob/Grep and MCP diagnostics (#175) — DO NOT MERGE

[legal-office #175](https://github.com/nexagnet/legal-office/issues/175) scopes the
owner-authorized runtime investigation for central
[#36](https://github.com/nexagnet/.github/issues/36) and
[#37](https://github.com/nexagnet/.github/issues/37). On
`codex/tool-isolation-runtime-36-37` only, the already registered manual workflow
filename calls two diagnostic reusable workflows at one reviewed immutable central
SHA. Its Draft PR is for source review and evidence only. Do not merge it; the
approved Bash diagnostic on `main` remains the default-branch caller.

Both jobs require the owner actor, exact repository, `workflow_dispatch`, this fixed
branch ref and equality between `github.sha` and the required
`expected_consumer_sha` input. The reusable workflows repeat these gates and verify
the checkout SHA. Permissions remain read-only; each job maps only the existing
Claude OAuth secret. No Publisher credential, Internet tools or Figma grant is added.

Before dispatch, record independent source review and successful CI for the exact
central source and consumer HEAD, confirm both pins agree, and recheck the live
consumer branch still matches the reviewed SHA. Dispatch the branch version of the
existing registered filename with the actual full reviewed SHA:

```sh
gh workflow run claude-sandbox-probe-caller.yml --repo nexagnet/legal-office --ref codex/tool-isolation-runtime-36-37 -f expected_consumer_sha=FULL_REVIEWED_CONSUMER_SHA
```

The required input freezes the reviewed consumer commit; it is not a configurable
tool prompt or target. Record the resulting run ID, attempt, actor, event, ref,
consumer SHA and referenced central workflow SHA before accepting its output.
Do not redispatch merely because a client polling session ended; inspect the live
run first.

The Read job uses a synthetic HOME and 15 fixed calls: positive controls plus
Read/Glob/Grep cases for home, absolute, symlink and normalized path aliases.
Authoritative native denial evidence is required for negative cases. Filtered-empty
results or missing telemetry are `NOT_PROVEN`. The MCP job first requires actual
startup, initialization and tool discovery from four benign local stdio fixtures,
then checks a fresh candidate environment for zero starts and zero discovered MCP
servers. Its exact-control Read guard bounds unrelated tool access; it is not
evidence of native Read denial or MCP startup suppression.

Record the trusted per-job verdicts and sanitized `read-isolation-proof` and
`mcp-isolation-audit` artifacts on #175 and the corresponding central issues.
Validate artifact structure and evidence independently. CI, model prose and an
overall Actions success do not establish isolation. Missing controls, incomplete
calls or malformed telemetry remain `NOT_PROVEN`; observed denied content or
candidate MCP startup is a failure. Never upload or print raw execution files,
canary values, credentials or model/tool transcripts.

Keep central #42/#43 in Draft and unmerged. This experiment does not activate their
candidate production changes or close broader security acceptance. Stop dispatches
to roll back; retain sanitized evidence and leave main callers and secrets intact.
