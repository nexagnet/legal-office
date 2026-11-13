# 07. Quy ước làm việc

## Với chủ dự án

- Chủ dự án: **Phùng Việt** (tài khoản GitHub `phungtienviet14-sketch`). Giao tiếp bằng **tiếng Việt**; trả lời **ngắn, kết quả trước**, câu đầy đủ, ít gạch đầu dòng rời rạc.
- Chủ dự án thường giao việc rồi đi vắng và đọc lướt khi quay lại. Việc có thể hoàn tác thì cứ làm và báo; việc **không hoàn tác được** (đổi production, xóa hàng loạt, gửi ra ngoài, đổi bí mật, xóa dịch vụ) thì chờ chủ dự án đồng ý rõ.
- Khi hỏi thì công việc nên đã xong phần lớn; **tự chốt** những gì suy ra được từ quy tắc đã chốt hoặc Figma. Không tự quyết điều chưa chốt có ảnh hưởng pháp lý, tiền, dữ liệu khách.
- Đánh dấu rõ điều **suy đoán** hoặc **chưa kiểm**; số liệu phải nói rõ là đo hay ước, đo ở đâu, ngày nào.

## PR và merge

- Chủ dự án cho phép (05/11/2026, giữ hiệu lực): **tự merge PR của chính mình khi CI đúng head xanh và không còn review mở** (squash). Vẫn **hỏi trước** khi động tới: `.github` (CI/CD, workflow), hạ tầng, bí mật, deploy production, xóa dữ liệu/dịch vụ; và đổi/xóa secret luôn hỏi.
- Mức rủi ro dùng trong dự án: R0/R1 tự merge có bằng chứng; **R2** (auth, phân quyền, dữ liệu pháp lý, migration) được tự merge khi CI xanh; **R3** (`.github`, CI/CD, hạ tầng, secret, deploy) hỏi trước.
- Không force-push (bị chặn); đồng bộ nhánh bằng merge `origin/main`. Chọn số migration **sau khi** kiểm `main`.
- PR phải bắt đầu bằng hai dòng ghi nguồn yêu cầu (theo cấu hình dự án) và thêm người yêu cầu làm assignee + reviewer; cuối mô tả PR có dòng ghi công cụ.
- Mỗi PR giao diện nên có ảnh chụp trước/sau trên dev, đối chiếu Figma.
- Tài liệu hay báo cáo nên bền thì để trong repo (`docs/`); báo cáo tạm của luồng làm việc nằm ở thư mục tệp của dự án.

## Giao diện

- **Tối giản**: bỏ chữ giải thích thừa, nút thừa, đoạn lặp với tiêu đề. Một hành động chính tô màu mỗi màn.
- **Bộ lọc nghiệp vụ là trung tâm** vùng trên danh sách; tìm kiếm để ô tìm ở header lo.
- **Không bỏ cột nào** của bảng; dùng `DataTable` chung.
- **Figma DMS v2** (`bueSNVniMoYD6lQFHwqeHz`) là chuẩn; kiểm 1440/1024/768/390; menu hover không xê dịch.
- **Mục A chỉ chứa cột sổ S-0x**; thông tin khác sang mục C.
- Tìm thư viện có sẵn trước khi tự viết code.

## Dữ liệu và bảo mật

- **Dữ liệu dev là dữ liệu giả**; Claude toàn quyền xóa/seed lại dev. Dữ liệu khách thật chỉ vào khi chủ dự án cho phép, và **không bao giờ** vào repo, báo cáo, log, chat.
- **Không dán khóa/mật khẩu/token vào chat hoặc repo.** Hướng dẫn nhập bí mật bằng `read -s` trên server; GitHub Secrets cho CD.
- Không gửi nội dung tài liệu thật ra dịch vụ ngoài (OCR chỉ tự host).
- Repo **công khai**: không ghi IP server, mã tenant khách, tên người dùng cuối, giá trị bí mật.

## Công cụ và môi trường làm việc

- GitHub: dùng REST (`gh api`), không dùng GraphQL. Repo `nexagnet/legal-office`; không đụng repo khác (đặc biệt `nexagnet-platform`, dự án khác; **không viết code pháp lý vào platform**).
- Trên PC của chủ dự án, thư mục làm việc `C:\Users\phung\Documents\vietpt\legal-office` (đường dẫn máy chủ dự án, không dùng làm đường dẫn trong mã). Clone Windows: `core.autocrlf=false`.
- Server production điều khiển bằng phiên `claude rc` trong tmux (user `dev`, `/opt/legal-office`). Không chạy lệnh nặng (build, OCR) trên server.
- Figma: dùng khi còn hạn mức công cụ của gói; hết hạn mức thì vẽ bản HTML tương tác để duyệt.
- Thread/luồng làm việc: mỗi việc một thread; nhớ cập nhật bộ nhớ dự án khi có quyết định mới; không trùng việc giữa các thread (ví dụ vùng lọc và hướng dẫn do một thread giữ).
