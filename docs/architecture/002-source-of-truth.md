# Legal Office — Source of Truth & Evidence Boundaries

> **Trạng thái:** R0 documentation; không phải chứng nhận thực thi, bằng chứng UAT hay ý kiến pháp lý. **Repository `nexagnet/legal-office` hiện PUBLIC** theo owner amendment 12/10/2026; chỉ dữ liệu giả lập/synthetic được đưa vào GitHub.
>
> **Authority:** [Canonical product Issue #1](https://github.com/nexagnet/legal-office/issues/1), [Product ADR-0001](ADR-0001-product-boundary.md), [Traceability](../product/traceability.md), [legacy business #448](https://github.com/nexagnet/nexagnet-platform/issues/448), [repo split #472](https://github.com/nexagnet/nexagnet-platform/issues/472).

## 1. Các lớp nguồn sự thật — ĐÃ CHỐT

| Nguồn | Sở hữu sự thật nào | Không được suy ra |
|---|---|---|
| **GitHub Issue #1 / quyết định owner** | Phạm vi sản phẩm, quy tắc nghiệp vụ đã chốt, thẩm quyền ra quyết định | Chat/agent/PR cũ không tự thay đổi business rule |
| **PostgreSQL (khi được triển khai)** | Hồ sơ, trạng thái quy trình, phân quyền/chi nhánh/tenant, sổ sự kiện và audit nghiệp vụ | Không là sổ kế toán/thay thế MISA hoặc bằng chứng một văn bản đã được ký ngoài đời chỉ vì có flag |
| **MISA bên ngoài** | Thu/chi, công nợ, hóa đơn, khoản thanh toán, VAT, nhắc nợ | Ứng dụng không tạo money ledger, payment allocation hoặc nhập số tiền từ MISA ở phase 1 |
| **Kho tệp riêng tư (khi được phê duyệt và triển khai)** | Scan, tài liệu pháp lý, bản nháp, bằng chứng, hash, version và audit liên kết hồ sơ | Không biến scan thành bản gốc giấy; không biến tệp nháp thành văn bản đã ban hành |
| **Mẫu pháp lý chính thức có nguồn và phiên bản** | Nội dung/định dạng pháp lý chuẩn cho TT08 N-series, biểu mẫu và báo cáo liên quan | Figma hoặc LLM không phải thẩm quyền xác nhận mẫu in pháp lý |
| **Figma** | Đề xuất thiết kế UX/workflow để chủ sở hữu nghiệm thu | Không chứng minh API, runtime hay mẫu pháp lý chuẩn |
| **GitHub main/PR/CI + preview runtime** | Code, thay đổi, SHA, kiểm thử kỹ thuật và bằng chứng chạy thử | CI xanh không đồng nghĩa nghiệp vụ/luật pháp đúng hoặc production được phép |

## 2. Xác thực và phê duyệt nguồn — ĐÃ CHỐT

- Business rule chốt phải truy ngược được **nguồn quyết định** ở Issue #1 hoặc quyết định owner mới, cùng Task Contract, acceptance case và evidence. Không tự chọn điều luật/biểu mẫu khi các nguồn mâu thuẫn.
- Quyền **Admin/Trưởng VP duyệt trên ứng dụng** khác quyền ký/chuyển giao do pháp luật quy định. Phần mềm không thể tự cấp thẩm quyền pháp lý cho THV hoặc cơ quan THADS.
- Kế toán chỉ xác nhận **đã kiểm tra thanh toán đủ bên MISA** bằng trạng thái quy trình và audit phù hợp; không lưu sổ tiền, không tự kéo tiền/tạo bút toán. Quy trình hủy xác nhận phải được phê duyệt đúng vai trò.
- Văn bản đã ký, đóng dấu và **scan cuối cùng** khác bản nháp DOCX/PDF. Hoàn tất tác vụ trong UI không tự chứng minh đã ký ngoài thực tế.
- **TT06 phụ lục I–IX** chỉ tra cứu/xem/tải; không phát hành bằng quyết định của hệ thống. **TT08** và các báo cáo N-09/N-10 cần mẫu gốc xác minh về phiên bản, đơn vị tính và kết quả render trước khi được gắn `OFFICIAL-READY`.
- Bản ghi hồ sơ pháp lý sau ký cần audit/chỉnh sửa theo thủ tục riêng; không sửa như trường biểu mẫu thông thường.

## 3. Không đưa dữ liệu khách vào GitHub — ĐÃ CHỐT

- Repository PUBLIC, gồm Issue, PR, branch, commit, Actions log và artifacts: **không đưa hồ sơ thật, PII, chữ ký, scan, hợp đồng khách, khóa bí mật hay bản sao dữ liệu sản xuất vào**.
- Dùng dữ liệu synthetic cho mã nguồn, test và demo. Quyền lưu trữ hồ sơ thực ngoài trụ sở và triển khai Cloud/production vẫn là **OWNER-DECISION / LEGAL GATE**; public code không cho phép public hồ sơ.
- Dữ liệu nghiệp vụ giữa tenant/chi nhánh/hồ sơ phải được phân quyền phía API và audit; UI ẩn nút không chứng minh cách ly dữ liệu.

## 4. Trạng thái bằng chứng — KHÔNG ĐƯỢC ĐÁNH ĐỒNG

`DESIGNED` → `CODED` → `EXACT-HEAD CI PASS` → `INDEPENDENT REVIEW PASS` → `MERGED` → `EXACT-MAIN CI PASS` → `RUNTIME-PROVEN` → `LEGAL/CUSTOMER ACCEPTED`.

Mỗi cấp cần evidence riêng. Bootstrap CI của `legal-office` chỉ chứng minh việc chạy kiểm thử nền, **không chứng minh** Builder/Reviewer workflow_call, đăng nhập, pháp lý mẫu in, DB concurrency, phân quyền hoặc UAT.

## 5. Những gì còn SUY LUẬN / NOT_PROVEN

- Cấu trúc package, ORM Prisma/Drizzle, thư viện DOCX/PDF, storage provider: lựa chọn kỹ thuật **chưa chốt**, cần PoC/ADR độc lập ([#4](https://github.com/nexagnet/legal-office/issues/4)).
- Mỗi mẫu pháp lý phải được đối chiếu **bản gốc có nguồn/phiên bản** và bản render; nếu chưa có, gắn `NOT_PROVEN`, không chế tạo biểu mẫu pháp lý chính thức.
- Chi tiết quyền Cloud chứa hồ sơ thật, production và sự đồng ý/ủy quyền hợp lệ của khách: chưa qua gate.
- Publisher GitHub App, consumer Claude caller và Reviewer end-to-end: chưa có runtime proof, dù các workflow trung tâm đã merge.

## 6. Truy vết

Ma trận [traceability](../product/traceability.md) ánh xạ quy tắc đã chốt tới Issue, test và proof. Nếu có xung đột giữa tài liệu này và **Issue #1 được owner cập nhật hợp lệ**, phải mở PR đồng bộ tài liệu; không âm thầm sửa các business rule theo quyết định của AI.
