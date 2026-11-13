# Legal Office repo: overview (5 Nov 2026)

Read-only snapshot of `nexagnet/legal-office` at `main` = `808d12b` (PR #419).

## What the app does
Multi-tenant document management (DMS) for Vietnamese civil-judgment enforcement offices (văn phòng thừa hành viên). First customer: Văn phòng Hai Bà Trưng, Hà Nội (three locations). Since 30 Oct 2026 the product is a records/document store, not a staff workflow tool.

- Four case modules: Vi bằng, Tống đạt, Xác minh điều kiện THA, Tổ chức THA.
- Saved records are immutable, even for Admin. Changes go through an amendment request with a scanned supporting document, approved by Admin.
- Drafts until "Xác nhận lưu chính thức", then frozen.
- Three Văn thư registers (incoming / outgoing / internal) and statutory books S-01, S-02, S-04, S-05 exported as PDF per TT 08/2026.
- N-09/N-10 report figures only (customer fills in the official form), office supplies stock with FIFO, self-hosted OCR (Tesseract `vie`) for search.
- Permission groups: 92 permissions, per-branch scoping, per-account overrides. One system Admin group.
- Login with email or CCCD, 12+ char passwords, forced change on first login, reset by email link.

## Stack
- pnpm 9 monorepo, Node 22, TypeScript.
- `apps/api`: NestJS 11, PostgreSQL with plain SQL. Business logic lives in Postgres functions; 118 numbered migrations in `apps/api/drizzle/`. Row-level security per tenant (`app.tenant_id`).
- `apps/web`: Next.js 15, React 19, Tailwind 4, Radix, TanStack Table, pdf.js.
- Other: S3/R2 file storage, pdfkit/docx/exceljs, nodemailer + MJML, croner schedules.
- Hosting: Northflank (free tier, both service slots used), auto-deploy from `main` to dev at https://dev.nexagnet.com. **No production yet; all data is fake.**
- CI (`.github/workflows/ci.yml`): bootstrap checks plus app verify (lint, typecheck, test, build). Claude builder/reviewer/repair workflows are also present.

## Current state
- Very active: PRs #390–#419 merged over 4–5 Nov (DMS phases P0–P9, cleanup of old screens, user guide, auto-numbering).
- CI on `main` is **green** (run #924, 5 Nov 07:20 UTC). The PR run before it (#922) failed and was fixed before merge. I did not run the tests locally.
- Almost no TODO/FIXME comments in the code (0 in .ts/.tsx/.sql).
- The current source of truth for the rules is `docs/handoff/NGHIEP-VU-TOAN-DU-AN.md`. Older docs under `docs/product` and `docs/design`, and Issue #1, describe the pre-DMS workflow and are out of date.

## In flight

### Open PRs (7, all stale, none touched since 3 Nov)
| # | Title | Note |
|---|---|---|
| 386 | docs: pre-production review, fill in A2 from customer site | newest (3 Nov) |
| 224 | docs(deploy): Northflank rebuild on new account | 27 Oct |
| 198 | docs: Northflank CD and auto migrations | 27 Oct |
| 193 | fix(api): allow reading contract annexes/participants/attachments | 26 Oct, likely superseded by the DMS pivot |
| 176 | test: branch-only Read/MCP diagnostics [DO NOT MERGE] | draft |
| 166 | [claude] Issue #158 | draft, bot |
| 160 | [V5 SMOKE] reviewer runtime proof | draft |

### Open issues (33)
- #363: handoff status, 2 Nov.
- #265: DMS master change request (4 modules, 3 registers, reports, approved amendments).
- Most of the others (#1–#24, #85–#89) are October epics for the old workflow model; many are probably done or superseded.
- R3 infra/CI issues (#2, #37, #38, #156–#175) need a human decision.

### Branches
About 100 remote branches, mostly `claude/*` and already squash-merged. The handoff notes cleanup is waiting on the owner's OK.

### Open questions in the handoff doc
- Must a case have at least one document before it is entered in a register?
- Counting rule for the Tổ chức THA column in N-09.
- Confirm the old MISA gate is replaced (D-2).
- The customer's original Excel templates for N-09/N-10 are missing.
- OCR quality has not been measured on real scans.
- Print dialog for book PDFs is not yet confirmed on a real screen.
- Production go-live checklist (`docs/engineering/go-live-checklist.md`) is entirely unchecked: bootstrap tenant, SMTP, backups, schedules (scan purge, reminders, OCR job), TLS, RLS check.
