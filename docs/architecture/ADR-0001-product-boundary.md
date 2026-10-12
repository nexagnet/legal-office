# ADR-0001: Độc lập hóa sản phẩm Legal Office trong GitHub Organization `nexagnet`

- **Trạng thái:** OWNER-APPROVED về ranh giới sản phẩm; quyết định thư viện chi tiết đang chờ PoC
- **Ngày quyết định:** 2026-10-11
- **Nguồn:** [Legal Office #1](https://github.com/nexagnet/legal-office/issues/1), [migration #472](https://github.com/nexagnet/nexagnet-platform/issues/472), [business #448](https://github.com/nexagnet/nexagnet-platform/issues/448)
- **Thiết kế UX:** [Figma](https://www.figma.com/design/bueSNVniMoYD6lQFHwqeHz?node-id=92-3) — tham khảo UX, không phải code hay mẫu in pháp lý chuẩn.

## Context

Repo PUBLIC `nexagnet/nexagnet-platform` đang bao gồm Vận tải/AI và một bộ tenant/experience registry, Prisma migrations, CI/deploy dùng chung. Các PR pháp lý chưa merge #440/#467/#468 có phụ thuộc kiến trúc này. Yêu cầu sản phẩm pháp lý đủ bốn nghiệp vụ, nhiều hồ sơ/chứng cứ nhạy cảm, trình tự ký/đóng dấu và xuất mẫu đặc thù. Trộn vòng đời release, schema và security của chúng vào repo Vận tải khiến các thay đổi độc lập khó chứng minh chính xác bằng CI và runtime.

## Decision — ĐÃ CHỐT

1. Sản phẩm mới trong repo **PRIVATE `nexagnet/legal-office`**, không phát triển code nghiệp vụ pháp lý mới ở public `nexagnet-platform`. Giữ các công việc hiện hữu của Transport/AI/BMSL không bị ảnh hưởng.
2. **Một modular monolith đa tenant**. Bốn domain Vi bằng, Tống đạt, Xác minh điều kiện THA, Tổ chức thi hành án là các bounded context trong cùng sản phẩm; quản lý Văn phòng là nhóm capability dùng chung, không phải microservice riêng.
3. **Next.js/React**, **NestJS/TypeScript**, **PostgreSQL**, **pnpm workspace** làm nền kiến trúc. Repo sở hữu CI, database migrations, runtime và lịch phát hành riêng. Một tenant = một tổ chức pháp lý; địa điểm/chi nhánh thuộc tenant; Văn phòng Hai Bà Trưng có một Văn phòng và ba địa điểm.
4. **Tách ba loại nguồn sự thật**: PostgreSQL giữ hồ sơ và trạng thái nghiệp vụ; MISA giữ thu chi, công nợ, kế toán (sản phẩm chỉ lưu xác nhận đã kiểm tra thanh toán đủ); file object storage riêng tư giữ bản quét, tệp sinh ra, chứng cứ có hash/version/audit. Trạng thái công việc nền không được tự thay trạng thái pháp lý.
5. **Quyền app khác thẩm quyền pháp lý**. Admin hoặc Trưởng VP được duyệt chuyển hồ sơ/ủy quyền trên app, nhưng quyết định/văn bản vẫn do đúng chủ thể có thẩm quyền ký. API enforce tenant/branch/role/case, không dựa vào ẩn nút UI.
6. Không sao chép toàn bộ repository, history, migration Vận tải, Caddy, secrets, GitHub workflows hay tenant experience framework cũ. Chỉ xem/port chọn lọc code đã review và phù hợp hợp đồng #1 thông qua PR mới.
7. Figma thuộc sản phẩm khách hàng: chừa chỗ logo, không hiển thị Nexagnet; thiết kế là **prototype để duyệt**, không phải xác thực biểu mẫu chuẩn hoặc runtime.
8. Chính sách GitHub: R0/R1/R2 Builder sau Task Contract, risk trước ready và CI/Reviewer được chứng minh. R2 merge qua owner; R3 kiểm soát thủ công và human merge. GitHub live + exact-head/main CI + runtime proof là bằng chứng.

## Engineering hypotheses — SUY LUẬN, chưa chốt thành quy tắc nghiệp vụ

- Cấu trúc đề xuất: `apps/api`, `apps/web`, `packages/*`, `docs/*` trong một pnpm workspace; domain có owners và public contracts rõ. Cấu trúc cụ thể sẽ chốt bằng ADR sau khi kiểm source thực tế.
- ORM **Prisma hay Drizzle chưa quyết định**. [PoC #4](https://github.com/nexagnet/legal-office/issues/4) phải so sánh được race khi cấp số Vi bằng theo năm, transaction lưu tiến độ từng phần/nhiều nghĩa vụ và audit, chất lượng migration/rollback, performance/reliability.
- Các lựa chọn cần kiểm chứng versions/license/security: React Hook Form + Zod, TanStack Query, CASL hoặc Nest policy guards, pg-boss, Docxtemplater, Gotenberg, object storage chuẩn S3. Không thêm Redis/Kafka/Kubernetes/microservice nếu chưa có case chứng minh.
- Mẫu TT08 chỉ được ghi `OFFICIAL-READY` sau khi có bản gốc pháp lý, mapping và so sánh render/golden; TT06 I–IX chỉ tra cứu/tải không phát hành.

## Alternatives considered

| Phương án | Kết quả |
|---|---|
| Thêm mọi domain pháp lý vào public `nexagnet-platform` | Bị loại do CI/release/migrations/dependency và dữ liệu pháp lý dùng chung với Vận tải/AI |
| Tạo bốn repository/microservices theo từng nghiệp vụ | Bị loại vì giao dịch và quyền đa domain cần phối hợp, tăng vận hành quá mức |
| Tách **một** private repo, modular monolith đa tenant | **Chọn**; có DB, CI, phiên bản, quyền, vòng đời riêng; vẫn tái sử dụng patterns sau review |

## Consequences and mandatory gates

- Phải thiết lập repo-local CI, branch protection, Claude Builder/Reviewer qua [R3 onboarding #2](https://github.com/nexagnet/legal-office/issues/2) và [org control-plane #14](https://github.com/nexagnet/.github/issues/14). Việc GitHub App được cài “all repos” **không chứng minh workflow chạy**.
- Private repo không đồng nghĩa được đưa hồ sơ khách hàng thật vào git. Dữ liệu demo bắt buộc tổng hợp giả; Cloud chứa bản scan thật **chưa được phép vận hành production** do các thủ tục pháp lý còn chờ.
- PR từ repo cũ vẫn unmerged/reference-only. Tất cả work trong repo mới phải có Issue/Task Contract và evidence mới; không auto-merge R2/R3.
- Để đánh giá “xong nghiệp vụ” cần tách **đã viết code ≠ exact-head CI ≠ reviewer ≠ merge ≠ exact-main CI ≠ runtime-proven ≠ nghiệm thu pháp lý**.

## Acceptance and proof status

- **Ranh giới sản phẩm:** OWNER-APPROVED (#1, #472).
- **Repo private:** LIVE CONFIRMED 2026-10-11 (repo ID 1414510878, initial main d12157054e196021295744f12b68ecb777d5084f).
- **Repo CI/Claude onboarding:** NOT_PROVEN tại thời điểm tạo ADR (0 workflows/Actions).
- **ORM, permissions library, document renderer, Cloud provider:** PENDING ENGINEERING PoC.
- **Pháp lý ngoài trụ sở, production, real customer data:** OWNER/REGULATORY GATE.

## Amendment 2026-10-12 — repository visibility (OWNER DECISION)

- Chủ sở hữu (Phùng Việt) đã chuyển `nexagnet/legal-office` từ PRIVATE sang **PUBLIC** vào 2026-10-12 để dùng ruleset bảo vệ `main` mà không cần gói GitHub trả phí. Nguồn: quyết định của owner trong project thread; GitHub live ghi nhận `private: false`.
- Các chữ "PRIVATE/private repo" ở các mục phía trên và trong `business-contract.md`, `traceability.md` phản ánh quyết định ngày 2026-10-11 và **được thay thế bởi amendment này** về mặt hiển thị repo; các quyết định kiến trúc khác không đổi.
- Hệ quả bắt buộc: source, Issues, PR và workflow logs đều công khai. **Tuyệt đối không** đưa hồ sơ khách hàng thật, PII, scan, secrets, khóa hay biểu mẫu có dữ liệu cá nhân vào repo, Issue, PR, artifact hay log; dữ liệu thử nghiệm chỉ là dữ liệu tổng hợp giả. Cloud/production/customer data vẫn bị chặn bởi owner/legal gate.
- Việc có nên đưa lại repo về PRIVATE (cần gói trả phí để dùng ruleset) là quyết định riêng của owner.
