# Legal Office — hợp đồng nghiệp vụ đã chốt

> **Nguồn chính thức:** [GitHub Issue #1](https://github.com/nexagnet/legal-office/issues/1). Tài liệu này là bản sao truy vết của những quy tắc đã được owner chốt; nếu về sau Issue #1 cập nhật, cần PR đồng bộ tài liệu, không tự coi file cũ là quyết định mới.
>
> **Phạm vi:** 4 nghiệp vụ pháp lý và quản lý Văn phòng, đa tenant, không triển khai kế toán MISA.
> **Chưa chứng minh:** code, hợp chuẩn biểu mẫu pháp lý, chữ ký số, CI, triển khai runtime hay quyền Cloud production.
> **Dữ liệu:** minh họa/chỉ dẫn, không chứa hồ sơ khách hàng thực.
> **Trạng thái repository hiện hành:** PUBLIC theo quyết định owner 12/10/2026, không được commit hồ sơ/PII/secret/log nhạy cảm. Các mô tả PRIVATE lịch sử được thay thế về visibility; yêu cầu bảo mật hồ sơ không thay đổi.

---

# CANONICAL PRODUCT & BUSINESS CONTRACT — LEGAL OFFICE (PUBLIC CODE REPOSITORY; CUSTOMER DATA PRIVATE)

**Authoritative destination repository:** `nexagnet/legal-office` — PUBLIC by owner amendment 2026-10-12 (previously PRIVATE on 2026-10-11). **Do NOT implement any legal-office feature back in public `nexagnet/nexagnet-platform`.**
**Source/traceability:** [legacy business #448](https://github.com/nexagnet/nexagnet-platform/issues/448), [repo separation and architecture #472](https://github.com/nexagnet/nexagnet-platform/issues/472), [Vi bằng detail #426](https://github.com/nexagnet/nexagnet-platform/issues/426), [org R3 onboarding #14](https://github.com/nexagnet/.github/issues/14), [Figma all screens](https://www.figma.com/design/bueSNVniMoYD6lQFHwqeHz?node-id=92-3).
This Issue is the **canonical product coordinator and business authority** inside the target repository. It is **NOT a Builder task**; NO `autopilot:ready`. Source PRs #440/#467/#468 in the old repo remain unmerged/reference-only. Any legacy statement saying code must remain in `nexagnet-platform` is **SUPERSEDED**, but approved business rules remain valid.

## ĐÃ CHỐT — PRODUCT / TECH ARCHITECTURE
- Deliver the **entire product**: (1) Vi bằng, (2) Tống đạt, (3) Xác minh điều kiện thi hành án, (4) Tổ chức thi hành án, and complete shared Văn phòng management. No Vi-bang-only scope. Product must be reusable for other legal offices, **not hardcoded** for Hai Bà Trưng.
- One standalone PUBLIC code repository (no real customer artifacts) containing a **tenant-aware modular monolith**, Next.js/React frontend, NestJS/TypeScript API, PostgreSQL, pnpm workspace, independent DB/migrations/CI/releases; each legal domain owns its models and rules, shared security/files/audit/contracts as appropriate. No separate microservices/repositories per legal domain.
- Company brand: **tenant logo placeholder in UX; NO Nexagnet logo** in customer-facing UI. Reference Figma is UX proposal/acceptance input, **not functional app and not legal-form authority**.
- Office Hai Bà Trưng consists of **one legal office with three operational locations** (Trụ sở chính, Đông Anh, Bắc Ninh), one central Admin; not three tenants. Future customers isolated as separate tenants.
- No live production, real legal-customer records, imported contracts, secrets, GitHub permission changes or Cloud external storage until explicit human/legal authorization. The user's customer has **NOT YET completed external-premises storage approval**. Cloud hosts management scans, paper originals remain stored physically; phase 1 **is not certified legal digital signing**.
- `nexagnet/.github` is org control plane, not runtime data platform; new repo has NO CI/Claude workflow verified at initial commit. Org R3 onboarding is a prerequisite before any `autopilot:ready`.

## ĐÃ CHỐT — ACTORS & PERMISSIONS
- App roles/personas: Admin, Trưởng Văn phòng, THV (Thừa hành viên/Thừa phát lại), Thư ký, Văn thư, Kế toán. **App permission ≠ statutory authority to sign/issue a legal document**.
- THV sees Vi-bang cases across branches but may only perform responsible THV operations when assigned. All Thư ký can view/work permitted Vi-bang case support across locations. Admin configures allowed multi-branch scopes for Văn thư and Kế toán.
- Vi bằng: Admin/THV/Thư ký/Văn thư can CREATE; **ONLY Admin may assign exactly one responsible THV**. Until assigned support staff can collect materials but no responsible THV legal step proceeds.
- Vi-bang **internal case fields**: permitted direct edits during exactly **48 continuous hours after case creation**, weekends included; afterward Admin-approved Change Request, with before/after, reason and actor audit. Signed/stamped final legal content requires special technical correction (N-11), NOT ordinary edits regardless of time.
- Tống đạt: Admin **or** Trưởng Văn phòng may assign case/document work. For **transfer/delegation**, Admin **or** Trưởng Văn phòng may APPROVE IN THE APP; legally required signed decision remains for the legally competent signer and handover proof. App approval cannot grant signature authority.

## ĐÃ CHỐT — VI BẰNG
- Customer = PERSON or ORGANIZATION, contract optional at intake, one contract may relate to multiple cases. Intake progressive minimum fields; full legally necessary fields required before legal completion.
- **MISA is the ONLY accounting ledger** for charges, payments, partial payments, debts, tax/VAT, invoices and overdue reminders. **NEVER implement financial ledger, allocation, receivables, money dashboard, MISA accounting replacement or MISA API sync in first stage.**
- Kế toán with branch access MANUALLY verifies full paid status in MISA and records **only a process confirmation** `NOT_CONFIRMED | CONFIRMED_FULL` with actor/time and non-sensitive external reference, **without money amount**. Only `CONFIRMED_FULL` enables Văn thư to allocate Vi-bang number. Kế toán may request revocation of an incorrect confirmation; **Admin approves/rejects** with immutable audit. Pending/disputed/revoked confirmation **blocks return before actual handover**, preserves legal number and signed artifacts, requires re-confirmation.
- `<sequence>/<year>/VB-THV`: **one office-wide, annual, atomic, unique/idempotent series** (not per branch). Admin verifies/configures prior year's/current-year last used number for migration; resets sequence each calendar year, never reuses numbers even if cancelled. Historical cases imported separately/later.
- No online draft approval required before number allocation; THV checks and signs **outside** software. Provide both generation of drafts from official N-03/N-04 canonical data and uploading externally drafted DOCX/PDF with versioning; drafts ≠ issued legal scan. Legal correction N-11 is separate protected procedure.
- THV confirms Vi bằng was signed; Văn thư confirms stamped; **must upload and check complete final scan with signature AND stamp before marking returned**. Original paper remains original; no legal e-signature implementation in stage 1.
- Contact customer manually (call/message), record attempts/outcome and in-app reminders, not automated SMS/Zalo/email; contacted ≠ actually returned.
- Can RETURN result when completed/scan/valid MISA process gate and stamped/signed, **even if Sở/CSDL registration is pending**. Track statutory update deadlines separately, evidence, fallback and incidents; failure after already returned MUST NOT revert RETURNED or corrupt signed final file. S-03 is Sở-owned, S-02 is office-owned.
- No routine hard deletion; cancellation/invalidity reason + audit + legal retention. Protect final records, support legitimate copies and corrections.

## ĐÃ CHỐT — TỐNG ĐẠT
- **One request/case contains multiple documents**, each independently tracking recipient, address, deadline, assignee, attempts, outcome, evidence, report to requesting authority. Never close parent because one document succeeded while others remain.
- Admin/Trưởng VP assigns. Record actual failure, niêm yết or other legally applicable exceptions; absent recipient ≠ successful notice.
- N-01 contract, N-02 report/minutes/notice, office S-01 ledger; responsible actor and official document requirements. Real-world signing/confirmation separate from electronic app approval.

## ĐÃ CHỐT — XÁC MINH ĐIỀU KIỆN THA
- A case contains **multiple verification rounds and information sources**; per-round objective, assigned person, source and evidence, partial result; whole-case conclusion independently reviewed by competent legal actor, never decided by LLM.
- N-05 service contract, N-06 legally signed decision, office S-04; deadlines, privacy/purpose-limited disclosures, proof and versioning.
- Delegation to another authorized office: customer's **written consent** and prescribed documents/notice, internal Admin/Trưởng VP on-app approval and separate legally authorized signatures; never move private case data without satisfying gates.

## ĐÃ CHỐT — TỔ CHỨC THI HÀNH ÁN
- **Case-centered**: one legal case has MULTIPLE parties (creditors/debtors and relevant persons), MULTIPLE court-ordered obligations, each independently tracking partial/incremental results and legal evidence; MULTIPLE assets each with append-only events, links to parties/obligations and official orders.
- Completing one obligation does NOT automatically complete parent case. Distinguish legal obligation figures/data from any accounting record; **no MISA substitute, collections/receipts/disbursement books**.
- Proposed asset-preservation/enforcement measure ≠ actual order issued by competent THADS authority. No platform/THV automatic seizure/freezing based solely on a proposal.
- N-07 contract, N-08 signed transfer/handover proof, office S-05; transfer/delegation requires app Admin/Trưởng VP approval, separate legal signature and evidence of actual handover.

## ĐÃ CHỐT — SHARED OFFICE
- Contracts/customers, decision/document registry, incoming/outgoing correspondence, branch/personnel role scopes, secure digital filing/search/evidence/audit, workflow/approval inbox and mobile on-site work.
- Office stationery/inventory (paper, ink, etc.) using **FIFO by batch**; **distinct from seized assets** in legal THA cases; do not create a financial stock ledger.
- Statutory office books S-01/S-02/S-04/S-05/S-06; Excel/PDF/print; N-09/N-10 aggregated report only with verified official Excel template source and correct unit/period mapping. S-03 belongs Sở, not the office.
- **TT06 appendices I–IX**: only library SEARCH, VIEW, DOWNLOAD; no auto-fill/issue by this office. **TT08 legal N-series**: generate as applicable only with accurate authentic source and authorized signers; compare rendered files with source templates before 'official-ready'.

## SUY LUẬN — ENGINEERING CHOICES TO PROVE, NOT OWNER BUSINESS RULES
- Workspaces may be `apps/api`, `apps/web`, `packages/legal-*`, `packages/shared`; exact structure/architecture ADR after repository bootstrap.
- **Prisma vs Drizzle is NOT decided**; objective technical PoC: concurrent annual serial allocation, partial obligation/event+audit transaction, migration safe rollback and PostgreSQL constraints. Select based on tests/performance and record ADR.
- Candidate libs: React Hook Form + Zod, TanStack Query, CASL or Nest policy guards, pg-boss, Docxtemplater, Gotenberg, S3-compatible private object storage; evaluate versions/security/licenses and DOCX/PDF layout. No arbitrary microservices/Redis/Kafka/Kubernetes upfront.
- Reuse old public repo code ONLY selectively after full scope/PII/security/license diff review: #440 legacy Vi-bang unmerged; #467 docs draft; #468 likely old ExperienceId registry that is NOT portable. No copy of old 68 transport migrations, shared Caddy, deploy, secrets or old history.

## OWNER-DECISION / STOP GATES
- R2 merge for identity/PII/legal case state, migration, tenant isolation; R3 repo rules, GitHub App/caller/workflow, CI/deploy/infra/secrets, always human-controlled. No auto-merge on R2/R3.
- Production and real customer files/tenant, Cloud compliance, legal signer conflicts, permission expansion, external API credentials: stop and request actual human decision/authorization.
- Specific legal-print conformance needs official original source+verified version; if missing record `NOT_PROVEN`, do not fabricate.

## OBJECTIVE
Implement the complete multi-tenant legal-office platform with four domain capabilities and full shared office, as validated against owner decisions and official legal sources, staged by architecture dependencies not by removing later domains from initial delivery.

## SCOPE
Requirements/ADR/contracts, secure foundation, four domains, legal documents, official template mapping, shared office, reporting, mobile, synthetic UAT; no production without separate gate.

## OUT OF SCOPE
MISA accounting ledger, TT06 issuance automation, unapproved real documents, direct Sở integrations or AI legal decisions, copying old public repo whole, R3 control-plane editing under ordinary V4.

## ACCEPTANCE
1. Every owner rule has traceability to an Issue, code task, API/UX test or a documented owner/legal gate; no contradictory older rule implemented.
2. Four domains implemented as distinct module owners; shared office complete, verified with Figma-based workflows and authoritative forms.
3. Multi-tenant and case/branch legal auth negative tests, encrypted/private file access, audit/versioning, atomic numbering and legal status invariants proved on synthetic data.
4. Exact-head CI/Reviewer same HEAD, R2 owner human merge, exact-main CI, isolated preview runtime evidence for each business domain.
5. No marked `RUNTIME-PROVEN` without deployed exact SHA and business scenario proof; customer UX/legal acceptance and production gates separate.

## RISK
R2 coordinator (cross-cutting private legal PII and persistent case model); NOT a V4 task. R3 repo/bootstrap delegated to org#14 and local onboarding issue.

## RUNTIME PROOF
Real legal-office repo SHA and CI, tenant-isolated synthetic preview (role/branch/PII denial, 48h, MISA confirmation/no amount, number concurrency, sign/stamp/scan/return/Sở incident, Tống đạt multi-doc attempts, Xác minh multi-round, THA many obligations/assets/partial results, office FIFO, legal template snapshots and XLSX/PDF). No real customer data.

## STOP CONDITIONS
No CI/Claude integration verified; R2/R3 merge; real data/cloud/production; unresolved legal authority; unsafe file or stale unmerged legacy code; all denied until authorized. No `autopilot:ready` on coordinator.

## REPOSITORY LIVE BOOTSTRAP EVIDENCE (2026-10-11)
Historical initial bootstrap: repo ID `1414510878`, initial SHA `d12157054e196021295744f12b68ecb777d5084f`, only README and 0 Actions on 2026-10-11. As of 2026-10-12 the repo is PUBLIC by owner decision, and bootstrap CI PR #26 has merged with 2/2 main jobs PASS. Central Builder/Reviewer are merged in `nexagnet/.github`, but **consumer caller/Publisher/Reviewer runtime is NOT PROVEN; Autopilot NOT ACTIVE**.

