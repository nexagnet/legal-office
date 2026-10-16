# ADR: Bản nháp biểu mẫu DOCX N-01…N-11 — lát đầu (issue #85)

- Trạng thái: **Đề xuất, chờ merge PR**
- Mã: `apps/api/src/forms/` — hàm thuần `renderFormDocx(code, input)`; **chưa** có endpoint, migration, UI, lưu tệp.
- Nguồn văn bản: Phụ lục III, Thông tư 08/2026/TT-BTP (`bieu-mau-nghiep-vu-thua-hanh-vien.docx`), phiên bản mẫu `TT08/2026-PL3`.

## Phạm vi

Có: N-01, N-02, N-03, N-04, N-05, N-06, N-07, N-08, N-11. **Ngoài phạm vi:** N-09, N-10 (cần Excel gốc), sổ S-xx, dữ liệu thật, tự ký.
Mọi tệp sinh ra là **bản nháp**: đầu trang và đầu thân có dòng `BẢN NHÁP – chưa được khách hàng/pháp lý chấp nhận`,
ghi `TT08/2026-PL3`, nêu "Không phải biểu mẫu chính thức". Dòng mã/"Ban hành kèm theo Thông tư…" của mẫu gốc
**cố ý không chép** để bản nháp không giống bản chính thức. Chữ ký, con dấu **luôn để trống**; chỉ in chức danh theo
`business-decisions-2026-10-16.md` mục A, dòng "Ai ký pháp lý": N-06 = Trưởng văn phòng; N-11 = Thừa hành viên đã lập
vi bằng, hoặc Trưởng văn phòng khi người đó không còn hành nghề (đầu vào `thvStillPracticing`; bỏ trống thì giữ
"THỪA HÀNH VIÊN/TRƯỞNG VĂN PHÒNG" như mẫu).

## Chọn thư viện: `docx` 9.11.0 (MIT)

|                           | `docx`                                                      | `docxtemplater` 3.71 + `pizzip`                                       |
| ------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| Nguồn mẫu                 | Mã TS (`templates/*.ts`), diff đọc được, không tệp nhị phân | Phải commit `.docx` mẫu có thẻ `{x}`; Word hay tách thẻ qua nhiều run |
| Chỗ trống `......`        | Mẫu chứa `{{khóa=chấm-gốc}}`; thiếu dữ liệu = giữ chấm gốc  | Phải sửa tay `.docx` đặt thẻ; "giữ chấm gốc" cần thêm logic điều kiện |
| Bảng động, đầu/chân trang | Dựng bằng mã (bảng kê, bảng sửa lỗi)                        | Vòng lặp/bảng nâng cao nằm ở module trả phí                           |
| Bố cục giống bản gốc      | Gần đúng (Times New Roman 13pt, A4) — không giống từng điểm | Giữ nguyên bố cục của tệp mẫu                                         |
| Chạy CI                   | Không cần tệp ngoài repo                                    | Phải đưa `.docx` nhị phân vào repo                                    |

Chọn `docx`: văn bản pháp lý là **dữ liệu mã nguồn có review được**, test không phụ thuộc `/mnt`. Đánh đổi: bố cục chưa
trùng từng điểm với tệp gốc. `jszip` (devDependency) chỉ dùng trong test để mở DOCX.

## Thiết kế

- `scripts/forms/extract-pl3-templates.py` trích văn bản từ tệp gốc → `templates/n-XX.ts` (sinh tự động, không sửa tay). Script **dừng**
  nếu số khóa ≠ số chỗ chấm của đoạn, nên không lệch ánh xạ âm thầm.
- Văn bản cố định giữ nguyên; chỗ chấm có nguồn dữ liệu (tên/địa chỉ các bên, ngày, số hợp đồng, số bản án…) được gắn khóa;
  chỗ không có nguồn (căn cứ pháp lý, quyền nghĩa vụ, tạm dừng…) giữ chấm để nhân viên điền tay.
- Đầu vào gõ kiểu (`form-input.ts`), mọi trường tùy chọn; ngày ISO `YYYY-MM-DD` (sai → `FormInputError`, không đoán); chuỗi rỗng = thiếu.
- Giá trị được làm sạch (bỏ ký tự điều khiển XML) và `docx` tự escape XML.

## Ánh xạ phạm vi (python-docx `d.paragraphs`, `P`; bảng `T`)

| Mẫu        | Tiêu đề / đoạn                                    | Bảng liên quan                                 |
| ---------- | ------------------------------------------------- | ---------------------------------------------- |
| N-01       | P10 (P7…P94 gồm Ghi chú), phụ lục BẢNG KÊ P95–P99 | T2 chữ ký; T3 bảng kê; T4 chữ ký phụ lục       |
| N-02       | P107                                              | T6 đầu mẫu; T7, T8 chữ ký                      |
| N-03       | P131 (P128…P218)                                  | T10 chữ ký                                     |
| N-04       | P228                                              | T12 đầu mẫu; T13, T14 chữ ký                   |
| N-05       | P269 (P266…P376)                                  | T16 chữ ký                                     |
| N-06       | P386                                              | T18 đầu mẫu; T19 nơi nhận + chữ ký             |
| N-07       | P409 (P408…P501)                                  | T21 chữ ký                                     |
| N-08       | P505                                              | T23 đầu mẫu; T24, T25 chữ ký                   |
| N-09, N-10 | không có đoạn                                     | T26, T27 (bảng Excel) — ngoài phạm vi          |
| N-11       | P576                                              | T29 đầu mẫu; T30 bảng sửa lỗi; T31, T32 chữ ký |

Bảng mã mẫu T1, T5, T9, T11, T15, T17, T20, T22, T28 và mục lục T0 không đưa vào bản nháp (xem trên). Có hai tệp `.docx` gần giống nhau
trong `/mnt/attach`; dùng tệp không có hậu tố `(1)`; khác biệt chỉ ở số dấu chấm/khoảng trắng, không khác chữ.

## Đối chiếu với PDF TT 08 (`pdftotext -layout`)

Mọi đoạn văn bản cố định của N-01…N-11 (bản dựng rỗng) khớp PDF sau khi bỏ khác biệt khoảng trắng/dấu câu/số dấu chấm;
N-03 và N-02 được soi kỹ. Ô tiêu đề bảng chỉ lệch do PDF ngắt dòng trong ô. **Không có khác biệt ở nội dung bắt buộc.** Lưu ý
đã sao nguyên văn: N-05 đoạn "Số tài khoản: … theo quy định của pháp luật thi hành án dân sự và Hợp đồng này để đảm bảo thi hành
khoản …" dính hai câu (lỗi của chính mẫu, PDF cũng vậy). Thay đổi có chủ ý của ta: thêm dấu cách quanh chỗ điền, bỏ khoảng trắng
thừa trước dấu phẩy, thêm chấm cho 3 chỗ N-01 (Bên B: đại diện/chức vụ, tài khoản, mã số thuế) và 1 chỗ N-03 (tên văn phòng) vì mẫu gốc không có chỗ chấm.

## Khoảng trống (chưa làm / chưa chắc)

- Chưa so **từng byte/từng điểm bố cục** với PDF; chỉ so văn bản. Cỡ chữ, lề, độ rộng cột là ước lượng.
- Chưa phân giải ngữ nghĩa các chỗ mẫu không ghi rõ: hai chỗ chấm sau "Vào hồi … giờ …" được hiểu là giờ và phút; số vi bằng của N-11
  ở dạng `……/……` (đoạn "Căn cứ vi bằng số" và đoạn cuối) **để trống**, chỉ điền dòng "Số vi bằng" dạng chuỗi tự do.
- Trường chưa có nguồn dữ liệu trong hệ thống: căn cứ pháp lý, quyền/nghĩa vụ, điều khoản chung, kho bạc nhận bản, thành phần
  "tham gia" của N-02, danh sách người tham gia (N-04 chỉ nhận một người), bảng kê N-01 không tự tính "Bằng chữ".
- Số tiền bằng chữ, số hợp đồng, tên pháp lý văn phòng do người gọi cung cấp (tên pháp lý **chờ đối chiếu giấy đăng ký**, mục A.10).
- Chưa có chấp nhận của khách/pháp lý (mục C) — vì vậy mọi tệp mang dòng BẢN NHÁP; chưa nên dùng để in chính thức.
- Chưa có luồng sinh/lưu tệp, quyền truy cập, audit: sẽ là lát sau, dùng lại `renderFormDocx`.
