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
The existing Builder and Reviewer workflow pins stay unchanged.

- Workflow: `.github/workflows/claude-sandbox-probe-caller.yml`, display name
  `Nexagnet V5 Legal Office Sandbox Probe (manual)`.
- Event: `workflow_dispatch` only, with no inputs. The job requires repository
  `nexagnet/legal-office`, actor `phungtienviet14-sketch` and `refs/heads/main`.
  The central workflow independently checks the actual default branch and actor.
- Central version: `748866182dd34fcc0beff4621b94b7a7e0ba48b9 (trước V5.1: 3a68dd9)`, the immutable
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

The current Reviewer caller pins `748866182dd34fcc0beff4621b94b7a7e0ba48b9 (trước V5.1: 128ed9e)`,
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

## Builder command and duplicate prevention rollout (#493)

The Builder caller uses the reviewed central merge SHA
`748866182dd34fcc0beff4621b94b7a7e0ba48b9 (trước V5.1: 3cc50ef)`.
[Central PR34](https://github.com/nexagnet/.github/pull/34) covers the shared implementation,
and [central CI44017644510](https://github.com/nexagnet/.github/actions/runs/44017644510)
passed on that SHA. [Consumer #493](https://github.com/nexagnet/legal-office/issues/493)
tracks this rollout and its runtime evidence.

The caller checks owner, repository and new Issue comment before a job with no
repository token permissions evaluates the body. Send `@claude` or `@claude retry`
as the entire comment. Matching is case-sensitive and ignores only trailing
ASCII spaces, tabs and line endings. The reusable Builder job starts only when
the gate accepts the command on the first workflow attempt. Central preflight
still verifies the live comment and Task Contract. Credentials are mapped only
to the reusable Builder job.

After independent review and CI on the PR HEAD, verify CI on the exact merge
SHA on `main`. Record the consumer and referenced central SHAs for fresh live
runs on a disposable, docs-only R0 issue. Use synthetic content, an approved
Task Contract and the existing Publisher App. Leave the test Drafts unmerged.

1. Post a prose comment containing `@claude`. Verify the command gate finishes
   and the reusable Builder job is skipped. The workflow run can exist because
   GitHub delivers the `issue_comment` event.
2. Post the standalone initial command. Verify one App-authored Draft, its
   issue-specific branch, the claim and the resulting CI on the exact PR HEAD.
3. Post another standalone initial command while the Draft is open. Verify
   `DUPLICATE_COMMAND_REJECTED`, no new Agent or Publisher work and one Draft.
4. Close the synthetic Draft unmerged. Post one standalone retry command. Verify
   the same issue claim advances and the App creates a new Draft. The rejected
   duplicate counted as the second command, so this retry uses the third slot.
5. Verify a fourth command using `@claude retry` reports
   `RETRY_BUDGET_EXHAUSTED` and creates no new Draft. Retain the owner commands
   as evidence since they define the ledger. Remove the synthetic `autopilot:ready`
   label and close the test issue and any remaining test Draft when finished.

A 401 or a missing runtime step leaves the corresponding App case unverified.
Only report an authentication failure when the trusted output establishes it.
Do not enable full Claude output or log credentials. Use the central runbook for
manual recovery of a stranded claim after the holder is confirmed terminal and
its branch has no pull request.

## V5.1 D1: automatic Repair removed

`claude-repair-caller.yml` was deleted: Claude must not auto-fix after a Reviewer
`REQUEST_CHANGES` or a CI failure (design V5.1, REQ-04). A `REQUEST_CHANGES` result is
now only a PR comment; the owner decides the next step. A repair on demand, if wanted
later, needs its own R3 task with an owner-issued command. Rollback: restore the file
from git history (last pin `3bedc42906b1417e5468bae890aae87c40ef8208`); do not restore it
while Reviewer and Repair would both react to the same run.

Credential: Claude runs in CI on the owner's Claude Pro OAuth token
(`CLAUDE_CODE_OAUTH_TOKEN`). It has a usage limit. On a 429 or limit error the review is
INCONCLUSIVE, nothing is merged, and nothing is retried automatically; the owner re-runs
CI by hand after the limit resets.

## Ignore có hạn: GHSA-fc5q-39xc-vjpf (picomatch, ReDoS)

Ngày 18/11/2026 check `audit` đỏ vì advisory mức high này chưa có bản vá (patched versions: `<0.0.0`).
Chủ dự án đã chọn bỏ qua có hạn: `pnpm.auditConfig.ignoreGhsas` trong `package.json`.
Lý do chấp nhận: picomatch chỉ nằm trong chuỗi công cụ build/test, không xử lý dữ liệu khách ở runtime
(chưa kiểm từng đường phụ thuộc; xem lại khi có bản vá).
**Xem lại muộn nhất 18/12/2026**: nếu đã có bản vá thì nâng phiên bản và xóa dòng ignore; nếu chưa thì
đánh giá lại và ghi ngày xem lại mới. Không thêm GHSA khác vào danh sách này nếu không có quyết định của chủ.

## V5.1 M1: kill switch, CODEOWNERS, PR template

- **Kill switch:** biến Actions của repo `AUTOPILOT_ENABLED`. Đặt `false` thì Builder và Reviewer
  dừng (điều kiện `vars.AUTOPILOT_ENABLED != 'false'`); CI, merge tay và deploy thủ công vẫn chạy.
  Chưa đặt biến hoặc giá trị khác `false` = bật như cũ. Biến do chủ đặt ở Settings > Secrets and variables
  > Actions > Variables; PR không sửa được biến này.
- **CODEOWNERS:** ghi chủ sở hữu vùng điều khiển. Chưa bật bắt buộc duyệt bởi code owner (xem lý do trong file).
- **PR template:** thêm dòng `Refs #N` để Reviewer tự động có thể đọc Issue liên kết.
- **Chưa làm trong PR này:** đồng bộ pin 4 caller (cần xác minh tương thích từng workflow trung tâm, PR R3 riêng);
  nhãn `hold`, `auto:merge` (chủ tạo ở Settings).

## V5.1 M2: `ready_for_review` cho CI

`ci.yml` chạy thêm khi PR chuyển từ Draft sang Ready (`types: [opened, synchronize, reopened, ready_for_review]`).
Lý do: Reviewer chỉ chạy sau CI hoàn tất; PR Draft đã xanh rồi chuyển Ready không có commit mới thì không có run CI
mới để Reviewer bám vào. Ảnh hưởng: thêm tối đa một lượt CI mỗi lần Ready; không thêm lượt Claude nếu SHA không đổi
vì Reviewer vẫn kiểm điều kiện riêng. Rollback: bỏ dòng `types`.

## V5.1 M4: release-policy (chế độ chỉ thông tin)

- `.github/workflows/release-policy.yml` + `scripts/release-policy.mjs` tính mức rủi ro R0-R3 của PR từ danh sách file
  (qua API) và nhãn `risk:R*` của Issue liên kết (`Refs #N`). Quy tắc: `.github`, AGENTS/CLAUDE, `deploy`,
  Dockerfile, `.env*` = R3; migration SQL, lockfile, `package.json`, đường dẫn phân quyền/RLS/tenant = R2;
  chỉ tài liệu = R0; còn lại R1; diff > 400 dòng hoặc > 20 file tăng 1 bậc; từ 100 file = R3; nhãn Issue chỉ nâng, không hạ.
- Chạy bằng `pull_request_target` nhưng chỉ checkout `main`, không bao giờ mã của PR; quyền chỉ đọc; kết quả ở job summary.
- **Không chặn merge** và chưa nằm trong check bắt buộc của ruleset. Theo dõi 2 tuần (đến khoảng 2/12/2026):
  nếu phân loại đúng thì chủ quyết định đưa vào ruleset (việc tay) và đổi sang chế độ bắt buộc ở PR riêng.
- Tắt: biến `AUTOPILOT_ENABLED=false` hoặc xóa workflow.

## V5.1: đồng bộ pin 4 caller về một SHA trung tâm

Cả Builder, Reviewer và Sandbox-probe caller đều ghim `nexagnet/.github@748866182dd34fcc0beff4621b94b7a7e0ba48b9` (PR trung tâm #49).
Đã kiểm: so với pin cũ, `claude-builder.yml` và `claude-sandbox-probe.yml` **giống từng byte**; `claude-reviewer.yml` chỉ khác 8 dòng
(concurrency theo PR, timeout 45 → 20 phút, `--model claude-sonnet-5-5`). Repair caller đã gỡ (xem mục D1).
Nếu Reviewer lỗi vì model chưa hỗ trợ với OAuth Pro: gỡ dòng `--model` ở trung tâm (PR riêng) rồi đổi pin;
không đổi model trong caller. Rollback: đưa pin Reviewer về `128ed9e61ab4ee8c7ac604ca05a4e4511d168f10`.
