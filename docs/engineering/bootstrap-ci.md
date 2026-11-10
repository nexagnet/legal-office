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

## Reviewer gate diagnostics rollout (#424)

Rollout #424 introduced central pin `29090cc1aef417ac4578acdb394b198cd95c1fa1`,
the merged [central PR46](https://github.com/nexagnet/.github/pull/46).
[Central exact-main CI](https://github.com/nexagnet/.github/actions/runs/42171561553)
passed on that SHA. This pin updates gate diagnostics only; the caller's triggers,
permissions, explicit OAuth mapping, five required CI jobs and Builder/Repair pins
are preserved. The bootstrap tests assert the immutable Reviewer pin.

A blocked gate reports `REVIEWER_GATE_BLOCKED` with a fixed reason and recovery
guidance in the Actions log and step summary. No AI verdict is produced when the
gate blocks. For example, `ISSUE_REFERENCE_MISSING` means the PR description needs
exactly one canonical reference (`Refs #N`, `Closes #N` or `Relates to #N`);
`OWNER_ATTESTATION` requires the exact owner-authored current-SHA request. Do not
treat missing authorization as a code review finding or bypass it to obtain PASS.

Rollout requires an independently reviewed R3 consumer PR, owner-controlled merge
and successful CI on the exact consumer merge SHA. Only then verify a disposable
docs-only Draft PR on `claude/*` with a separate R0/R1 Task Contract. Keep the smoke
PR unmerged, with no customer data, product code or production changes.

1. With no Issue reference, verify the deployed gate reports
   `ISSUE_REFERENCE_MISSING` and skips AI/reporter jobs.
2. Add exactly one canonical Task Contract reference; without an owner request,
   verify `OWNER_ATTESTATION` and skipped AI/reporter jobs.
3. The owner must explicitly authorize and post the following request at the
   actual current PR SHA; an agent must not manufacture this consent:

   ```text
   NEXAGNET_REVIEW_REQUEST HEAD_SHA=<current 40-character PR HEAD SHA>
   ```

4. Re-run CI for that SHA. Record the CI run and all five successful jobs,
   Reviewer run, central referenced SHA, verdict/comment and trusted
   `nexagnet-review-evidence` artifact. Check `diff_inspected=true` and matching
   current PR SHA. CI alone or the model's summary is not runtime proof.
5. A new commit requires a fresh owner request. Old-SHA CI/review must not
   authorize the new HEAD. Record any blocked result accurately.

Owner-authored smoke PRs do not qualify for the existing Repair caller's
Publisher-bot provenance lane. Reviewer proof does not establish Repair, Figma
image comparison, merge enforcement or general tool isolation. Roll back the
Reviewer pin through a reviewed R3 PR if runtime acceptance fails; keep existing
fallbacks and unrelated workflow pins intact.

## Bounded Reviewer SDK failure hints (#430)

The current Reviewer caller pins `128ed9e61ab4ee8c7ac604ca05a4e4511d168f10`,
the merged [central PR48](https://github.com/nexagnet/.github/pull/48), verified by
[exact-main CI42570343030](https://github.com/nexagnet/.github/actions/runs/42570343030).
It adds only
a trusted failure-only diagnostic after the Claude action. Permissions, model,
Action version, hidden full output, verdict schema and Reporter gating are
unchanged. The consumer diff changes the pin, its two assertions and this document.

Live [smoke PR427](https://github.com/nexagnet/legal-office/pull/427) at
`323c87720f1cee7714692cc766fc2e9d508f1108` proved the missing-reference and unsigned
owner gates in Reviewer run `42569147517`, attempts 1 and 2. After approved owner
request `6733243595`, attempts 3 and 5 passed the gate but the SDK returned
`is_error: true` without structured output; Reporter skipped and no evidence
artifact was produced. Attempt 4 independently failed during Bun download (504).
These failures do not prove a provider authentication or quota cause.

The new central step reads only bounded, validated runner-local SDK metadata and
emits fixed advisory auth/rate/model/unknown/output-unavailable codes. It never
prints raw errors, transcripts or paths, creates no verdict/artifact, and cannot
turn a failed Claude action into a successful review. Unknown remains unknown;
do not enable full output or Actions debug to investigate it.

After exact-head CI, reviewed owner-directed merge and exact-main CI, re-run the
successful smoke source CI at its unchanged approved SHA. This creates a fresh
Reviewer run using the new default-branch caller. Rerunning an older Reviewer run
keeps its old workflow context and cannot validate the new pin. Verify the fresh
referenced central SHA, original CI/PR association, genuine owner request and
actual fixed hint or trusted verdict/artifact. Keep PR427 Draft and unmerged. If
an account/authentication step needs owner interaction, report that blocker and
leave credentials unchanged.
