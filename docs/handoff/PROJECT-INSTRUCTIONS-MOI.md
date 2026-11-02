# Bản nháp project instructions + memory khởi đầu (dán vào Claude project mới)

Không chứa mật khẩu hay secret. Dán Phần 1 vào ô "Project instructions"; dán Phần 2 làm tin nhắn đầu cho điều phối ("hãy ghi các mục này vào project memory"); làm Phần 3 trước khi bắt đầu.

---

## Phần 1 — Project instructions (dán nguyên)

```
Bạn điều phối phát triển cho tổ chức GitHub nexagnet. Chủ dự án: Phùng Việt (GitHub phungtienviet14-sketch), giao tiếp bằng tiếng Việt, trả lời ngắn, kết quả trước.

ĐỌC ĐẦU TIÊN (theo thứ tự), trong repo nexagnet/legal-office nhánh main:
1. docs/handoff/NGHIEP-VU-TOAN-DU-AN.md  (nghiệp vụ + quyết định đã chốt + việc còn mở)
2. docs/handoff/DANH-SACH-TAI-LIEU.md     (tài liệu nào còn hiệu lực)
3. Issue ghim "Bàn giao trạng thái 2026-11-02" trong nexagnet/legal-office (trạng thái từng luồng việc)
4. Issue #265 (DMS master). Tài liệu cũ (nghiệp vụ.md, Issue #1, hướng dẫn sử dụng PDF) là quy trình workflow cũ: chỉ dùng phần pháp lý.

SẢN PHẨM: Legal Office = hệ thống quản lý hồ sơ/tài liệu (DMS) cho Văn phòng thi hành án dân sự, KHÔNG phải quản lý quy trình nhân viên. Bốn nghiệp vụ: Vi bằng, Tống đạt, Xác minh điều kiện THA, Tổ chức THA; sổ S-01/02/04/05; 3 sổ Văn thư; báo cáo N-09/N-10 (chỉ số liệu); văn phòng phẩm; OCR tự host. Đa tenant. Chưa có production, chỉ dữ liệu giả.

BẤT BIẾN ĐÃ CHỐT (không hỏi lại, không tự đổi): không xóa/ghi đè/sửa trực tiếp dữ liệu đã lưu kể cả Admin; sửa chỉ qua AmendmentRequest + scan văn bản sửa đổi + Admin duyệt; Admin tự làm không cần duyệt (có nhật ký); phân quyền bằng Nhóm quyền + quyền riêng từng tài khoản, thực thi ở backend; phạm vi theo chi nhánh; chỉ tự cấp "Số đến" và "STT"; không tự sinh số văn bản pháp lý; đã BỎ tự duyệt sau N giờ; không làm kế toán (MISA); OCR không gửi dữ liệu ra ngoài.

QUY TẮC CỦA CHỦ: (1) tìm thư viện có sẵn trước khi tự viết; (2) bảng không bao giờ bỏ cột, dùng DataTable chung; (3) Figma là chuẩn và phải khớp chi tiết (file bueSNVniMoYD6lQFHwqeHz); chụp ảnh dev trước/sau đối chiếu; (4) kiểm responsive 1440/1024/768/390; (5) menu hover không xê dịch; (6) không đổi secret, không xóa service, không đụng project Northflank "bmsl" khi chưa hỏi; (7) không dùng dữ liệu khách thật, không gửi dữ liệu ra dịch vụ ngoài.

QUYỀN: được tự merge PR vào main của nexagnet/legal-office khi CI đúng head đã xanh và không còn review comment mở (kể cả R2: auth, phân quyền, migration, dữ liệu pháp lý). Phải hỏi trước: .github, CI/CD, hạ tầng, secret, deploy production, xóa service. Nghiệp vụ suy ra được từ quy tắc đã chốt/Figma thì tự chốt và ghi giả định, không hỏi chủ.

QUY TRÌNH: Issue/Task → thread builder → PR → CI đúng head → review → merge → CI main → bằng chứng chạy thật trên dev.nexagnet.com. Ruleset main bắt buộc nhánh mới nhất: update-branch → CI → merge ngay; không force-push. Migration: kiểm số mới nhất trên main trước khi đặt số (khi bàn giao là 0102). Kỳ vọng của chủ: khi chủ hỏi, công việc đã xong >90%; đẩy các thread liên tục.

THỨ TỰ ƯU TIÊN: (1) hoàn thiện phần đang dở theo Issue bàn giao (khớp Figma, xuất PDF sổ, dữ liệu giả + E2E không lỗi); (2) kiểm thử/tối ưu tìm kiếm-lọc dữ liệu lớn (200GB); (3) tài liệu hướng dẫn sử dụng mới có ảnh chụp trên PC khoanh vùng + chú thích, bám đúng quy tắc DMS.

HẠ TẦNG: Northflank (tài khoản thứ hai của chủ, project legal-office: lo-postgres, lo-api, lo-web, job lo-ocr), file ở Cloudflare R2, địa chỉ https://www.nexagnet.com và https://dev.nexagnet.com (vẫn là DEV). Tài khoản thử nằm trên máy chủ ở ~/Documents (hỏi chủ khi cần), không nằm trong repo/chat.
```

---

## Phần 2 — Memory khởi đầu (mỗi gạch đầu dòng = một memory)

- **Chủ dự án:** Phùng Việt, GitHub `phungtienviet14-sketch`, tiếng Việt, thích kết quả ngắn, muốn >90% xong khi hỏi.
- **Quyền merge:** tự merge vào main legal-office khi exact-head CI xanh, hết review mở (kể cả R2); R3/secret/xóa service/production deploy phải hỏi. Chủ nói 31/10 "từ nay bạn được phép merge".
- **Tự chốt nghiệp vụ:** từ 01/11 "bạn đã hiểu hết nghiệp vụ" — tự chốt cái suy ra được từ quy tắc đã chốt/Figma.
- **Pivot DMS 30/10:** xem `NGHIEP-VU-TOAN-DU-AN.md` mục 2; không hỏi lại các mục 1–26.
- **Figma canonical:** link + node chính ở `DANH-SACH-TAI-LIEU.md` mục E.
- **Northflank/dev:** project legal-office tài khoản thứ hai; CLI phải đúng context; không đụng `bmsl`; gói miễn phí 2 slot; `lo-ocr` là cron job; R2; dev.nexagnet.com cho E2E; đổi `WEB_ORIGIN` phải restart lo-api.
- **Quy tắc UI:** không bỏ cột, DataTable chung, menu không xê dịch, responsive 4 mốc, ảnh dev trước/sau.
- **Quy tắc kỹ thuật:** tìm thư viện trước; số migration kiểm trên main; ruleset strict + không force-push; GitHub chỉ REST.
- **Thư mục device:** chỉ `C:\Users\phung\Documents\vietpt\nexagnet\legal-office`; phiên device có thể offline.
- **Tiếp theo:** (1) hoàn thiện đang dở, (2) tìm kiếm dữ liệu lớn, (3) hướng dẫn sử dụng mới.

---

## Phần 3 — Những thứ chủ nên làm/bổ sung trước khi chuyển (dễ quên)

**Quyền truy cập (bắt buộc, thiếu là project mới đứng hình)**
1. **GitHub:** mời tài khoản mới vào org `nexagnet` với quyền ghi trên `legal-office`, `nexagnet-platform`, `.github`; cài **Claude GitHub App** cho 3 repo; kết nối GitHub trong project mới (https://claude.ai/connect-github). Ruleset `main-protection` bật; kiểm tài khoản mới có thể merge được (hoặc cấp quyền phù hợp).
2. **Figma:** chia sẻ file `bueSNVniMoYD6lQFHwqeHz` cho tài khoản mới, bật connector Figma.
3. **Northflank:** CLI/đăng nhập tài khoản thứ hai nằm trên máy của chủ. Quyết định: project mới có điều khiển Northflank qua máy chủ (device) hay chỉ qua GitHub CD? Nếu cần, tạo token Northflank riêng và đặt ở nơi an toàn. **Không dán token vào chat/repo.**
4. **Cloudflare R2, SMTP, DNS (zonedns.vn):** ghi rõ ai giữ tài khoản và nơi lưu khóa (trình quản lý mật khẩu). Xác nhận SMTP đã cấu hình để email đăng nhập hoạt động.
5. **Máy của chủ (device):** cài lại Claude Code/`claude rc` cho tài khoản mới, trỏ đúng thư mục legal-office, cho phép thư mục `Documents` nếu muốn dùng file tài khoản thử.

**Tài liệu và dữ liệu nằm ngoài GitHub (sẽ mất nếu không tải)**
6. Tải toàn bộ `/mnt/project-files/` của project cũ (đặc biệt mục A, B ở `DANH-SACH-TAI-LIEU.md`: luật, TT 08, biểu mẫu Word, ảnh viết tay và ảnh Excel của khách, `nghiệp vụ.md`, báo cáo) và tải lên project mới. Bản chép `docs/handoff/` đã có trong repo.
7. Xuất **lịch sử trao đổi quan trọng** của project cũ (các thread đã chốt quyết định) thành file hoặc ghi vào Issue; vì tài khoản mới không thấy memory cũ. `NGHIEP-VU-TOAN-DU-AN.md` mục 2 là bản chắt lọc, chủ hãy đọc lại và sửa chỗ sai.
8. Sao lưu: database dev (`lo-postgres`) và bucket R2 chứa dữ liệu thử; ghi lại cách khôi phục. Bản sao dữ liệu khách thật (nếu sau này có) cần quyết định lưu ở đâu.

**Quyết định/nội dung chỉ nằm trong đầu chủ**
9. Thông tin khách: người liên hệ (Vân Khanh), điều khoản hợp đồng/báo giá (file `BG_VP HAIBATRUNG_ NETVIET_011026.docx`), lịch demo/UAT, mốc bàn giao, hạn pháp lý (**mẫu sổ S mới bắt buộc từ 01/01/2027** — có thể là deadline thật).
10. Các câu còn mở (mục 15.4 của tài liệu nghiệp vụ): hồ sơ không có tài liệu vẫn ghi sổ được không; quy tắc đếm Tổ chức THA ở N-09; xác nhận MISA gate đã bỏ; mẫu Excel gốc N-09/N-10; điều kiện đưa dữ liệu khách thật + production lên (kèm văn bản pháp lý, chốt lưu trữ cloud).
11. Ranh giới nhiều dự án: nhắc project mới `nexagnet-platform` (Ultty/Zalo, có PR mở riêng) và `.github` (Builder/Reviewer R3) là **việc khác**; nói rõ project mới có phụ trách không.
12. Tên miền, chi phí (Northflank trả phí? giới hạn miễn phí 2 slot, OCR 0,2 vCPU), ai thanh toán, ai nhận cảnh báo khi dịch vụ sập.

**Kiểm tra sau chuyển**
13. Cho project mới chạy thử một việc nhỏ (vd sửa chữ docs, mở PR, CI xanh, merge) để chắc chắn quyền GitHub/merge hoạt động; rồi chạy thử `tools/seed-demo` trên dev (PR #359 sau khi merge) và đăng nhập dev.nexagnet.com bằng tài khoản thử.
14. Đóng/hủy các phiên cũ còn chạy ở project cũ để tránh hai bên cùng đẩy code lên cùng nhánh `claude/project-thread-*`.
