# Ma trận truy vết — Legal Office

> Quy tắc nghiệp vụ chỉ được thay đổi tại [Issue #1](https://github.com/nexagnet/legal-office/issues/1) bởi coordinator sau khi có quyết định được chốt. Tệp này mô tả việc phân công/truy vết, **không phải kết quả test**.
> Thiết kế [Figma](https://www.figma.com/design/bueSNVniMoYD6lQFHwqeHz?node-id=92-3) để nghiệm thu UX; bản in pháp lý phải đối chiếu nguồn chính thức riêng.

| Capability/Owner rule | Nghiệp vụ đã chốt (rút gọn) | Implementation Task Contract(s) | Điều kiện chứng minh |
|---|---|---|---|
| Governance / kiến trúc | Private repo, 4 domain, R2/R3 gates | [#1](https://github.com/nexagnet/legal-office/issues/1) [#2](https://github.com/nexagnet/legal-office/issues/2) [#3](https://github.com/nexagnet/legal-office/issues/3) [#4](https://github.com/nexagnet/legal-office/issues/4) | #2 R3 human approval / #3 docs / #4 PoC |
| Tenant / phân quyền | Một văn phòng 3 địa điểm, nhiều tenant; Admin, THV, Thư ký, Văn thư, Kế toán, Trưởng VP | [#5](https://github.com/nexagnet/legal-office/issues/5) | #5 wrong tenant/branch/role HTTP denials |
| Vi bằng hồ sơ | Admin-only THV assignment, exactly 1 THV, 48h continuous internal edit | [#6](https://github.com/nexagnet/legal-office/issues/6) | #6 role and boundary time test |
| Vi bằng tài chính | MISA external; only CONFIRMED_FULL flag, accountant revoke request/Admin approve | [#7](https://github.com/nexagnet/legal-office/issues/7) | #7 role and process tests; NO finance ledger |
| Vi bằng số | One annual office-wide serial, unique/idempotent; legacy starting number | [#7](https://github.com/nexagnet/legal-office/issues/7) | #7 concurrent Postgres issue test |
| Vi bằng ban hành | THV signed confirm, Văn thư stamped confirm, final scan before returned | [#8](https://github.com/nexagnet/legal-office/issues/8) [#17](https://github.com/nexagnet/legal-office/issues/17) | #8 API negative cases + #17 UI |
| Vi bằng Sở | Return independent of Sở registration; incident cannot undo returned | [#8](https://github.com/nexagnet/legal-office/issues/8) [#17](https://github.com/nexagnet/legal-office/issues/17) | #8 incident scenario |
| Tống đạt | One request many documents, individual attempt/outcome, Admin/Trưởng VP assign | [#9](https://github.com/nexagnet/legal-office/issues/9) [#18](https://github.com/nexagnet/legal-office/issues/18) | #9 API + #18 UI E2E |
| Xác minh | One case many rounds/sources, separately reviewed conclusion, written consent delegation | [#10](https://github.com/nexagnet/legal-office/issues/10) [#12](https://github.com/nexagnet/legal-office/issues/12) [#19](https://github.com/nexagnet/legal-office/issues/19) | #10 source tests + #12 approval tests |
| Tổ chức THA nghĩa vụ | One case many parties and obligations; incremental evidence/results, no global premature completion | [#13](https://github.com/nexagnet/legal-office/issues/13) [#20](https://github.com/nexagnet/legal-office/issues/20) | #13 partial-results integration |
| Tổ chức THA tài sản | Asset legal events and competent-THADS decision distinct from THV proposal | [#11](https://github.com/nexagnet/legal-office/issues/11) [#20](https://github.com/nexagnet/legal-office/issues/20) | #11 agency-authority denial |
| Chuyển/ủy quyền | Admin OR Trưởng VP approves app; legal signer/actual handover separate | [#12](https://github.com/nexagnet/legal-office/issues/12) [#11](https://github.com/nexagnet/legal-office/issues/11) [#19](https://github.com/nexagnet/legal-office/issues/19) [#20](https://github.com/nexagnet/legal-office/issues/20) | #12 approval vs sign/handover negative tests |
| Office | Công văn, quyết định, văn thư, FIFO vật tư; TT06 chỉ tra cứu/tải | [#14](https://github.com/nexagnet/legal-office/issues/14) [#21](https://github.com/nexagnet/legal-office/issues/21) | #14 FIFO race/no negative + TT06 blocked auto issue |
| Official docs | TT08 N/S templates, Excel N09/10 exact source; S03 Sở-owned | [#15](https://github.com/nexagnet/legal-office/issues/15) | #15 source/versions + golden output, NOT_PROVEN allowed |
| Shared UX | 4 domains + office, 3 địa điểm, không logo Nexagnet | [#16](https://github.com/nexagnet/legal-office/issues/16) [#17](https://github.com/nexagnet/legal-office/issues/17) [#18](https://github.com/nexagnet/legal-office/issues/18) [#19](https://github.com/nexagnet/legal-office/issues/19) [#20](https://github.com/nexagnet/legal-office/issues/20) [#21](https://github.com/nexagnet/legal-office/issues/21) | #16 responsive tenant branding + downstream UI |
| Reports | Correct units of case/document/round/obligation; S01/02/04/05/06 XLSX/PDF | [#22](https://github.com/nexagnet/legal-office/issues/22) | #22 source-traceable totals and print |
| Mobile | Fieldwork permitted per persona, no fake client-only legal completion | [#23](https://github.com/nexagnet/legal-office/issues/23) | #23 Playwright responsive + API denials |
| UAT | Four domain synthetic workflow + office + case security runtime proof | [#24](https://github.com/nexagnet/legal-office/issues/24) | #24 exact-main deployment and test evidence |

## Quy trình dependency / cách bắt đầu

1. [#2 R3](https://github.com/nexagnet/legal-office/issues/2): kiểm tra và triển khai **manual control-plane**, rồi xác minh qua *test runner thực*, exact-head CI, independent Reviewer, human R3 merge và exact-main CI. Khi chưa chứng minh, **KHÔNG** gắn `autopilot:ready`.
2. [#3 R0](https://github.com/nexagnet/legal-office/issues/3): lưu tài liệu nghiệp vụ và ADR này qua PR; PR này là bản chuẩn bị, chưa có CI/Reviewer/runtime. [#4 R1](https://github.com/nexagnet/legal-office/issues/4): so sánh Prisma/Drizzle và thư viện bằng benchmark/PoC thực tế.
3. [#5 R2](https://github.com/nexagnet/legal-office/issues/5): foundation auth/tenant/office/branch/files/audit, chỉ được merge khi owner cho phép.
4. Các backend [#6–#14](https://github.com/nexagnet/legal-office/issues) chạy theo dependency/Prisma ownership, tránh hai agent cùng sửa schema. Không bắt ba nghiệp vụ phải chờ hoàn tất Vi bằng; có thể phát triển độc lập sau foundation.
5. [#15–#23](https://github.com/nexagnet/legal-office/issues): biểu mẫu, UI từng nghiệp vụ, office, báo cáo, mobile trên API đã được review/merge.
6. [#24 R2](https://github.com/nexagnet/legal-office/issues/24): synthetic cross-domain preview/UAT, bắt buộc ghi actual deployed SHA và bằng chứng nghiệp vụ.

## Điều cấm và trạng thái chứng minh

- MISA giữ kế toán: **không thêm** amount/charge/payment ledger, invoice/overdue/thu chi hay MISA API nếu chưa có quyết định mới.
- TT06 chỉ được xem/tải; không tự sinh quyết định của cơ quan THADS. Văn bản TT08 chỉ gọi chuẩn khi đối chiếu nguồn thực.
- Cloud lưu file nghiệp vụ thật, production và PII phải chờ owner/legal gate; bản scan khác bản gốc giấy và khác ký số.
- Quyền ứng dụng không quyết định tư cách pháp lý; API luôn fail-closed theo tenant/branch/case/action.
- Không chép nguyên repo PUBLIC cũ, migrations, secrets, lịch sử hoặc PR chưa merge vào main của repo này.
- **R0/R1** có thể xét auto-merge sau policy/CI/Reviewer; **R2** dừng ở owner merge gate; **R3** human-controlled.
- CODED, CI GREEN, REVIEWED, MERGED, EXACT-MAIN GREEN, RUNTIME-PROVEN và CUSTOMER/LEGAL ACCEPTED là **bảy trạng thái khác nhau**.

## Các quyết định chưa chứng minh

| Item | Trạng thái |
|---|---|
| Repo private + initial main | LIVE-VERIFIED |
| Onboarding Claude + CI trong repo | NOT_PROVEN; #2 |
| ORM Prisma/Drizzle | ENGINEERING POC, #4 |
| Bản in pháp lý official-ready | NOT_PROVEN cho đến khi #15 đối chiếu mẫu |
| Khách đồng ý lưu hồ sơ ngoài trụ sở | CHƯA CÓ, chờ customer/legal gate |
| Production & customer data | OWNER-DECISION riêng |
