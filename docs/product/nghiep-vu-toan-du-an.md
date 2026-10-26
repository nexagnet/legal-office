# Legal Office — Nghiệp vụ toàn dự án (bản đọc cho chủ dự án)

Ngày lập: 26/10/2026. Dành cho: Phùng Việt (chủ dự án).

**Nguồn:** `nghiệp vụ.md` (bản tổng hợp 11/10/2026), NĐ 151/2026/NĐ-CP, TT 08/2026/TT-BTP, các báo cáo trong `reports/` (mới nhất 22–23/10), và repo `nexagnet/legal-office` ở `main` (commit `517d5a8`, PR #191). Code là sự thật cho phần "đã làm". Tôi đọc code ở mức cấu trúc (menu, migration, tài liệu kiến trúc, quyết định nghiệp vụ), không chạy lại bản đang deploy. Tỷ lệ % lấy từ `legal-office-tien-do-nghiep-vu.md` (ước lượng, không phải số đo tự động). Dữ liệu duy nhất trong hệ thống là **dữ liệu giả**.

## Cách đọc các nhãn

| Nhãn | Nghĩa |
|---|---|
| 🔒 **CHỐT** | Chủ dự án/khách đã quyết, ghi trong `nghiệp vụ.md` hoặc Issue #1. Không tự đổi. |
| ✅ **ĐÃ LÀM** | Đã có trong app (DB + API + test, thường có cả màn hình). |
| 🟡 **GIẢ ĐỊNH** | Không có trong `nghiệp vụ.md`; Claude chọn theo ủy quyền 21/10/2026, đã ghi tài liệu, chủ dự án sửa được. |
| ⬜ **CHƯA LÀM** | Đã chốt nhưng app chưa có hoặc chưa đủ. |
| ❓ **MỞ** | Chưa có căn cứ hoặc đang chờ chủ dự án/khách; không được coi là quy tắc. |

---

## 1. Hệ thống để làm gì

Legal Office là phần mềm **quản lý một Văn phòng thi hành án dân sự** (khách đầu tiên: Văn phòng Hai Bà Trưng; thiết kế để phục vụ nhiều văn phòng, mỗi văn phòng một "tenant" tách dữ liệu). Văn phòng là **một pháp nhân** với ba địa điểm: Trụ sở chính, Đông Anh, Bắc Ninh. Ba địa điểm dùng chung bộ máy quản trị; hồ sơ ghi địa điểm để phân quyền và thống kê.

Hệ thống giúp nhân viên và lãnh đạo: theo dõi hồ sơ từ tiếp nhận đến bàn giao và lưu trữ, phân công và kiểm tra tiến độ, quản lý chứng cứ, biểu mẫu, sổ và báo cáo, không bỏ sót hạn và không ghi sai trạng thái.

**Ba nguyên tắc nền tảng (🔒 CHỐT):**

1. **Không quyết định pháp lý thay người có thẩm quyền.** Phần mềm ghi nhận, nhắc và chặn bước sai; người có thẩm quyền mới ký, ban hành.
2. **Phê duyệt trong phần mềm ≠ ký pháp lý.** Admin duyệt một đề nghị nội bộ không có nghĩa là Admin được ký quyết định.
3. **Không làm kế toán.** MISA là sổ kế toán duy nhất. Hệ thống chỉ ghi "đã/chưa xác nhận thanh toán đủ", không lưu số tiền thanh toán, công nợ hay bút toán.

**Bốn nghiệp vụ pháp lý** (đều thuộc phạm vi, 🔒): Lập Vi bằng, Tống đạt, Xác minh điều kiện thi hành án, Tổ chức thi hành án. Cộng với các hoạt động chung: khách hàng và hợp đồng, công văn, vật tư, nhân sự, sổ sách, biểu mẫu, báo cáo, thông báo, làm việc ngoài hiện trường.

---

## 2. Các vai và phân quyền

Sáu vai (🔒 CHỐT, `nghiệp vụ.md` §4). Tên "Thừa hành viên" (THV) là cách gọi theo luật hiện hành; tài liệu cũ gọi là Thừa phát lại.

| Vai | Được làm | Không được |
|---|---|---|
| **Admin** | Quản lý tài khoản, phân quyền, địa điểm. **Phân công THV cho Vi bằng (chỉ Admin).** Duyệt/từ chối sửa hồ sơ sau 48 giờ. Duyệt/từ chối đề nghị thu hồi xác nhận MISA. Duyệt trên phần mềm việc chuyển hồ sơ/ủy quyền. Xem tổng quan, báo cáo. | Không đương nhiên được ký hay ban hành văn bản pháp lý. |
| **Trưởng Văn phòng** | Theo dõi nghiệp vụ, phân công Tống đạt, duyệt trên phần mềm chuyển hồ sơ/ủy quyền, ký các văn bản thuộc thẩm quyền Trưởng VP (ví dụ quyết định xác minh). | Phân biệt "duyệt nội bộ" với "ký pháp lý". |
| **Thừa hành viên** | Tiếp nhận, lập hồ sơ; xem mọi hồ sơ Vi bằng của cả văn phòng; chỉ thao tác pháp lý trên hồ sơ **được giao**; xác nhận đã ký; tải chứng cứ; ghi kết quả thực tế. | Không làm bước pháp lý thay THV phụ trách khi chưa được phân công hợp lệ. |
| **Thư ký** | Tạo hồ sơ, nhập và hoàn thiện thông tin, chuẩn bị hợp đồng/biểu mẫu, bổ sung chứng cứ, liên hệ khách, theo dõi việc còn thiếu, đề nghị sửa sau 48 giờ. Xem cả ba địa điểm. | Không làm hành vi pháp lý chỉ dành cho THV/người có thẩm quyền ký. |
| **Văn thư** | Tạo hồ sơ; **cấp số Vi bằng** (khi đủ điều kiện); **xác nhận đã đóng dấu**; quản lý bản scan; tìm, xem, tải tài liệu; ghi việc gửi/cập nhật tài liệu cho cơ quan; theo dõi sổ, văn bản, lưu trữ. Phạm vi địa điểm do Admin cấp. | — |
| **Kế toán** | Xem danh sách hồ sơ cần xác nhận thanh toán; đối chiếu MISA; **xác nhận thanh toán đủ**; đề nghị thu hồi xác nhận nhầm. Phạm vi địa điểm do Admin cấp. | Không tự duyệt đề nghị thu hồi do chính mình gửi. Chỉ thấy Vi bằng, không thấy ba nghiệp vụ còn lại. |

**Quy tắc chung (🔒):** tách rõ quyền xem, tạo, bổ sung, sửa, phân công, đề nghị phê duyệt, phê duyệt, xác nhận hành vi thực tế, ký/ban hành, tra cứu/xuất. Xem được không có nghĩa là sửa được. Mọi thay đổi quan trọng lưu người làm, thời điểm, nội dung, lý do.

**Trong app (✅ ĐÃ LÀM):**
- Mỗi hàng dữ liệu cách ly theo tenant (RLS); API đóng kín mặc định; đăng nhập email + mật khẩu, khoá 15 phút sau 5 lần sai; nhật ký `audit_log` chỉ ghi thêm.
- Cấp hoặc đổi vai/chi nhánh theo nguyên tắc **hai người**: Admin đề xuất, Trưởng VP duyệt, hai người khác nhau.
- Quyền thật nằm ở các hàm SQL (kiểm vai, chi nhánh được cấp, người phụ trách), không phải ở file `policy.ts` (chỉ mô phỏng).
- Cờ `legal_signer` (quyền ký pháp lý) do Admin cấp cho Trưởng VP hoặc THV; thiếu cờ thì lỗi `SIGNING_AUTHORITY_NOT_GRANTED`.
- Người đề nghị thu hồi MISA không tự duyệt được (mã `SELF_APPROVAL`, PR #138).
- Menu theo vai; Kế toán chỉ thấy Vi bằng.

**Đăng nhập** (🟡 GIẢ ĐỊNH tham số; chủ dự án đổi hướng 23/10, mở rộng cho mọi vai 26/10): **mọi tài khoản** (Admin, Trưởng VP, THV, Thư ký, Văn thư, Kế toán) đăng nhập bằng mật khẩu **hoặc** bằng link gửi qua email (link dùng một lần, hết hạn 15 phút; bấm link mới sinh mã 6 số; nhập mã ở đúng trình duyệt; sai 5 lần thì huỷ; tối đa 3 lần gửi mỗi 15 phút; phản hồi luôn như nhau để không lộ email nào có tài khoản). Email chưa gửi được ở bản chạy vì SMTP trên `lo-api` chưa cấu hình (⬜ do chủ dự án); Admin nhập SMTP ở Quản trị.

**Chỗ lệch với nghiệp vụ đã biết (🟡, giữ nguyên chờ chủ dự án chỉnh):**
- Admin hiện làm được cả việc phân công Tống đạt, Xác minh, THA, trong khi §4.1 chỉ giao Admin phân công Vi bằng (phân công Tống đạt thuộc Trưởng VP). Giữ nguyên để không phá luồng khi Trưởng VP vắng; siết lại là quyết định nghiệp vụ.
- Ai giữ `legal_signer` là giả định (Admin/Trưởng VP/THV theo quyết định bổ nhiệm).
- Chưa có: quên mật khẩu, OTP, hết hạn mật khẩu, giới hạn theo IP.
- Năm tài khoản thử (Trưởng VP, THV, Thư ký, Văn thư, Kế toán) chưa tạo trên bản chạy; cần chủ dự án cho phép riêng.

---

## 3. Khách hàng, hợp đồng và hồ sơ (dùng chung)

### 3.1 Khách hàng và các chủ thể (🔒 §6)
Hai loại: cá nhân, tổ chức. Không coi mọi người trong vụ việc là khách. Một hồ sơ có thể có người yêu cầu, người tham gia, người có quyền lợi/nghĩa vụ, người nhận giấy tờ, cơ quan yêu cầu…, mỗi người một vai ghi rõ.

- 🟡 **Hồ sơ chủ thể tối thiểu** (suy luận kỹ thuật từ NĐ 151 Điều 30.2): cá nhân gồm họ tên, số định danh, địa chỉ, điện thoại; tổ chức gồm tên, mã số thuế/đăng ký, người đại diện, địa chỉ. Một danh bạ chủ thể dùng chung bốn nghiệp vụ.
- ✅ Có màn Khách hàng & hợp đồng (`/hop-dong`), API khách, số vi bằng theo khách. ⬜ còn: cột số hồ sơ theo khách; danh bạ chủ thể chung thật sự (đương sự THA hiện vẫn có bảng riêng).

### 3.2 Hợp đồng dịch vụ (🔒 §7)
Một khách nhiều hợp đồng; một hợp đồng liên quan nhiều hồ sơ Vi bằng; được tiếp nhận hồ sơ **trước** khi liên kết hợp đồng, nhưng trước bước pháp lý bắt buộc thì thông tin và tài liệu phải đủ. Mỗi nghiệp vụ có mẫu hợp đồng riêng (N-01, N-03, N-05, N-07). Hệ thống lưu hồ sơ hợp đồng, **không phải phần mềm kế toán**.

- ✅ Tệp đính kèm hợp đồng (bản scan PDF/JPEG/PNG, có hash) và liên kết người tham gia với vai (đại diện, thụ hưởng, làm chứng, khác) (🟡 theo đề xuất 21/10; PR #170, migration 0051). Chỉ vai tiếp nhận (Admin, Trưởng VP, Thư ký, Văn thư, THV) thao tác.
- **Phụ lục hợp đồng — 🟡 GIẢ ĐỊNH, `nghiệp vụ.md` chưa định nghĩa phụ lục.** Claude chọn ngày 23/10, ghi ở `docs/architecture/contract-addenda.md`, đã merge (migration 0052):
  - 4 loại: `EXTEND` gia hạn/điều chỉnh thời hạn · `SCOPE` bổ sung phạm vi · `PARTIES` đổi bên tham gia · `OTHER`.
  - Trường: loại, ngày hiệu lực, nội dung (tối đa 2.000 ký tự), **bản scan đã ký bắt buộc** (≤ 25 MB). Không có số tiền.
  - Số phụ lục tự tăng theo từng hợp đồng; **chỉ ghi thêm, không sửa/xoá** (sai thì thêm phụ lục mới); có audit.
  - Phụ lục chỉ là chứng từ lưu trữ: **không đổi trạng thái, không chặn thao tác, không tự gia hạn hợp đồng.**
  - ❓ Ba câu mở: có cần loại "chấm dứt sớm/thanh lý" riêng không; phụ lục có cần Trưởng VP duyệt trước khi hiệu lực không; ngày hiệu lực có được ở quá khứ không (hiện được).

### 3.3 Nguyên tắc hồ sơ (🔒 §8, §60)
Hồ sơ quản lý được: loại nghiệp vụ, các chủ thể, địa điểm, người tạo, người được giao, tài liệu/hợp đồng/quyết định, các mốc, trạng thái và kết quả, lý do tạm dừng/từ chối/huỷ/chuyển, lịch sử sửa/duyệt/bàn giao. Hồ sơ đã có giá trị pháp lý, đã cấp số, đã ban hành thì **không xoá, không sửa âm thầm**. Trạng thái cuối không được dùng để xoá diễn biến đã xảy ra.

---

## 4. Nghiệp vụ 1 — Lập Vi bằng (✅ ~90%)

### 4.1 Luồng chính (🔒)

```
Tiếp nhận → Admin giao 1 THV phụ trách → chuẩn bị tài liệu
→ Kế toán xác nhận thanh toán đủ (MISA) → Văn thư cấp số
→ lập/ký (THV) → đóng dấu (Văn thư) → bản scan cuối
→ liên hệ khách → TRẢ KẾT QUẢ (bàn giao thực tế)
→ cập nhật CSDL/Sở Tư pháp (theo dõi riêng) → lưu trữ
```

### 4.2 Các quy tắc đã chốt và trạng thái

| Quy tắc | Nội dung | Trong app |
|---|---|---|
| Tiếp nhận (§10) | Admin, THV, Thư ký, Văn thư được tạo hồ sơ. Nhập theo giai đoạn, không bắt đủ trường ngay. | ✅ Số tiếp nhận `<số>/<năm>/TN`, ghi người tạo. ⬜ Chưa có trường người tham gia, địa điểm và thời gian dự kiến riêng. |
| Từ chối yêu cầu (§10) | Pháp luật có trường hợp không được lập vi bằng; phải ghi từ chối, lý do. | ✅ 🟡 Danh sách đóng 8 khoản theo **Điều 28 NĐ 151** (người thân; an ninh/bí mật nhà nước; đời tư/trái đạo đức; thuộc phạm vi công chứng/chứng thực/dịch/sao y; chuyển quyền đất/tài sản không giấy tờ; giao dịch trái luật; công vụ quân đội/công an; khác có căn cứ). Ghi mã khoản + lý do + người ghi. Không đóng hồ sơ đã có số. (PR #98, #103) |
| Phân công (§11) | Chỉ Admin giao; đúng 1 THV chính mỗi lúc; đổi người phải có lý do và giữ lịch sử. | ✅ |
| Sửa 48 giờ (§12) | Sửa trực tiếp trong **48 giờ liên tục** từ lúc tạo (kể cả cuối tuần). Sau đó: đề nghị (trường, giá trị cũ/mới, lý do) → Admin duyệt/từ chối → lưu lịch sử. Không phải quyền sửa vi bằng đã ký, đóng dấu. | ✅ |
| Thanh toán MISA (§13) | Chỉ 2 trạng thái: chưa/đã xác nhận đủ. Ghi ai, khi nào, tham chiếu. **Không nhập số tiền.** Chưa xác nhận hợp lệ thì Văn thư **không được cấp số**. | ✅ |
| Thu hồi xác nhận sai (§14) | Kế toán đề nghị → Admin quyết. Nếu đã cấp số nhưng chưa trả khách: tạm chặn bàn giao. Không xoá số, không dùng lại số, không sửa âm thầm tài liệu đã ký/dấu. | ✅ (PR #138 chặn tự duyệt) |
| Cấp số (§15) | Định dạng **`<stt>/<năm>/VB-THV`**; **một dãy toàn văn phòng** (không tách theo địa điểm); tăng dần trong năm, sang năm bắt đầu lại; không trùng; mỗi hồ sơ cấp một lần; không dùng lại số của hồ sơ huỷ. Admin nhập số cuối khi đưa dữ liệu cũ vào. | ✅ Có cơ chế nhập số cuối sổ giấy. ❓ Số cuối thật là **dữ liệu khách phải cung cấp**; thiếu thì không cấp số thật. |
| Ký và đóng dấu (§16) | THV xác nhận **đã ký**; Văn thư xác nhận **đã đóng dấu**; hai hành vi riêng. Phân biệt: dự thảo / đã ký / đã đóng dấu / bản scan cuối hoàn chỉnh. Mẫu N-03 (hợp đồng), N-04 (vi bằng). | ✅ Xác nhận ký, dấu, tải scan cuối. ✅ Sinh bản NHÁP DOCX N-03/N-04 từ hồ sơ (xem mục 8). |
| Điều kiện "Đã trả" (§17) | Cần đủ 5 thứ: (1) xác nhận thanh toán còn hợp lệ, (2) THV đã ký, (3) Văn thư đã đóng dấu, (4) bản scan cuối đủ chữ ký và dấu, (5) bàn giao thực tế đã xảy ra. Liên hệ khách ≠ đã trả. Giai đoạn đầu **không** tự gửi SMS/Zalo/email cho khách. | ✅ Thiếu một thứ là chặn. Ghi nhật ký liên hệ (ngày, người, cách, kết quả) và ghi bàn giao. |
| Cập nhật CSDL/Sở (§18) | Việc riêng, **không chặn** việc trả nếu điều kiện bàn giao đã đủ. Hạn: **3 ngày làm việc** kể từ ngày kết thúc lập vi bằng (NĐ 151 Điều 30). Không cập nhật được thì gửi ngay vi bằng + tài liệu chứng minh đến Sở Tư pháp. Thất bại sau khi đã trả: giữ nguyên trạng thái trả, ghi sự cố, báo Admin và THV. | ✅ Theo dõi cập nhật Sở và sự cố độc lập với trạng thái trả. |
| Sửa lỗi kỹ thuật (§19) | Mẫu **N-11**; chỉ lỗi kỹ thuật, không đổi tính xác thực; ghi nội dung trước/sau, lý do, người sửa, chữ ký/dấu, ngày gửi. Hạn cập nhật CSDL và gửi người yêu cầu: **2 ngày làm việc** kể từ ngày lập (Điều 31). Không mở lại vi bằng để thay âm thầm. | ✅ API N-11 + áp dụng; hạn 2 ngày ✅. Người ký N-11: THV đã lập vi bằng (hoặc Trưởng VP nếu người đó không còn hành nghề tại văn phòng) 🟡. |
| Bản sao (§20) | Chỉ văn phòng đang lưu bản gốc cấp. | ✅ 🟡 Hai trường hợp theo **Điều 32**: (a) cơ quan có thẩm quyền yêu cầu bằng văn bản; (b) người yêu cầu/người tham gia. Lưu người yêu cầu, loại, căn cứ + văn bản, vi bằng gốc, số bản, ngày cấp, người nhận. Chi phí thuộc MISA. |

**Màn hình:** danh sách và chi tiết hồ sơ có dải số liệu, tiến độ dạng bước (PR #190), hồ sơ kèm khách/địa điểm/THV/số/bước tiếp theo. Một số API chưa có màn riêng: đối chiếu tại `reports/giao-dien-figma-tien-do.md`.

---

## 5. Nghiệp vụ 2 — Tống đạt (✅ ~75–80%)

**Mục tiêu (🔒 §21–27):** nhận yêu cầu và giao nhận giấy tờ, tài liệu cho đúng người, đúng nơi, đúng trình tự và hạn.

- **Một yêu cầu có nhiều văn bản** (🔒). Mỗi văn bản có người nhận, địa điểm, hạn, kết quả riêng.
- **Phân công:** Admin hoặc Trưởng VP (🔒). Ghi người, thời gian, hạn, mọi thay đổi và lý do. Quyền phân công trong phần mềm không thay điều kiện pháp lý về người được thực hiện tống đạt.
- **Mỗi lần thực hiện** ghi: ngày giờ, địa điểm, người làm, người nhận thực tế, phương thức, diễn biến, kết quả, biên bản/ảnh, lý do chưa làm được. Có thể nhiều lần cho một văn bản.
- **Không gặp người nhận ≠ thành công.** Nếu không giao trực tiếp, ghi nhận tình huống và làm bước tiếp theo (ví dụ niêm yết) khi luật cho phép/yêu cầu, kèm chứng cứ.
- **Kết quả độc lập từng văn bản.** Hồ sơ chỉ đóng khi **mọi** văn bản có kết quả hợp lệ. Báo cáo không lấy số yêu cầu thay số văn bản.
- **Báo kết quả cho cơ quan yêu cầu** (Tòa án, Viện kiểm sát, cơ quan THADS…): **2 ngày làm việc** kể từ khi thực hiện xong, kèm tài liệu chứng minh, trừ khi các bên thoả thuận khác (NĐ 151 Điều 26 theo `nghiệp vụ.md`; tài liệu `business-decisions` trích là Điều 25.2 — xem mục 12, cần đối chiếu số điều).
- Biểu mẫu: N-01 (hợp đồng), N-02 (biên bản). Sổ: **S-01**.

**Trong app:** ✅ nhiều văn bản/nhiều lần/bằng chứng, kết quả riêng, danh sách và biểu mẫu tạo yêu cầu, hạn 2 ngày có nhắc và đóng hạn, bản nháp N-01/N-02, đọc sổ S-01. ⬜ chưa có mẫu chính thức nguyên văn kiểm chứng với khách; ghi nhận gửi kết quả cho cơ quan còn ở mức theo dõi hạn.

---

## 6. Nghiệp vụ 3 — Xác minh điều kiện thi hành án (✅ ~70–75%)

**Mục tiêu (🔒 §28–35):** quản lý việc xác minh theo yêu cầu, nguồn thông tin, chứng cứ, kết quả. **Một hồ sơ nhiều đợt, nhiều nguồn**; kết quả một đợt không phải kết luận chung.

- **Tiếp nhận:** người yêu cầu và tư cách, đương sự, bản án/quyết định liên quan, mục tiêu và phạm vi, tài liệu, hợp đồng (N-05), hạn, người được giao.
- **Quyết định xác minh (N-06):** Trưởng VP ra quyết định trong **3 ngày làm việc kể từ ngày ký hợp đồng** (NĐ 151 Điều 35), trừ khi các bên thoả thuận khác; ghi sổ và gửi cơ quan có thẩm quyền. Admin duyệt đề nghị nội bộ **không thay** quyết định có chữ ký hợp lệ của Trưởng VP.
- **Mỗi đợt:** mục tiêu, thời gian/địa điểm, người làm, chủ thể/cơ quan cung cấp, nguồn, nội dung, chứng cứ, kết quả, vấn đề chưa rõ, việc tiếp theo. Khi có tài liệu mới, giữ lịch sử kết quả cũ.
- **Bảo mật:** thông tin tài sản, nhân thân, tình trạng pháp lý rất nhạy cảm; quản lý nguồn và căn cứ sử dụng; không suy đoán pháp lý từ thông tin chưa kiểm chứng; thiếu căn cứ thì **không tự kết luận xong**.
- **Ủy quyền thực hiện xác minh (5 điều kiện, 🔒):** căn cứ/phạm vi/lý do → văn bản đồng ý của người yêu cầu khi luật đòi → **Admin hoặc Trưởng VP duyệt trên phần mềm** → văn bản ủy quyền ký đúng thẩm quyền → thông báo, bàn giao tài liệu. Bấm duyệt không đủ để hoàn tất; thiếu văn bản đồng ý thì dừng.
- Sổ: **S-04**. Biểu mẫu: N-05, N-06.

**Trong app:** ✅ đợt, nguồn, tệp chứng cứ, kết quả đợt tách khỏi kết luận, đề xuất/quyết định kết luận, ủy quyền theo quy trình; hạn 3 ngày (ngày ký hợp đồng do người xử lý nhập; đóng hạn cần người có `legal_signer`); nháp N-05/N-06; đọc sổ S-04. ⬜ mẫu chính thức nguyên văn.

---

## 7. Nghiệp vụ 4 — Tổ chức thi hành án dân sự (✅ ~75%)

**Mục tiêu (🔒 §36–45):** quản lý hồ sơ ở mức nghiệp vụ pháp lý: đương sự, nghĩa vụ, kết quả từng phần, tài sản, biện pháp/quyết định/sự kiện, chứng cứ, chuyển giao và kết thúc. **Không làm sổ thu chi, không thay MISA.**

- **Nhiều đương sự, nhiều vai** (người được thi hành, người phải thi hành, người có quyền lợi/nghĩa vụ liên quan, đại diện, cơ quan tham gia). Không giới hạn một-một.
- **Nhiều nghĩa vụ**, mỗi nghĩa vụ có căn cứ, người có nghĩa vụ, người được hưởng, hình thức, hạn, kết quả, chứng minh, trạng thái. Số tiền trong bản án chỉ là **nội dung nghĩa vụ pháp lý**, không phải sổ thu chi hay xác nhận tiền đã chuyển.
- **Kết quả từng phần:** ghi bất biến (ai, khi nào, diễn biến, chứng cứ). **Hoàn thành một nghĩa vụ không làm xong cả vụ.**
- **Tài sản liên quan** (khác hoàn toàn với vật tư văn phòng): loại, mô tả, chủ thể, nghĩa vụ liên quan, nguồn xác minh, quyết định, biên bản/ảnh, lịch sử đổi tình trạng pháp lý.
- **Phân biệt 4 mức:** đề xuất biện pháp → cơ quan có thẩm quyền ra quyết định → biện pháp đã áp dụng → kết quả có chứng minh. Không suy diễn đề nghị thành quyết định có hiệu lực; không trao cho THV thẩm quyền của cơ quan THADS.
- **Chuyển hồ sơ:** đề nghị → phê duyệt nội bộ (Admin/Trưởng VP) → văn bản pháp lý hợp lệ → bàn giao thực tế → ghi hoàn tất. Chưa bàn giao thực tế thì chưa hoàn tất chuyển. Từ chối thì lưu lý do và cho đề nghị bổ sung.
- **Kết thúc vụ việc:** phải có căn cứ pháp lý và kết quả thực tế. 🟡 Chấm dứt vụ việc do Admin/Trưởng VP ghi, cần lý do có mã, căn cứ, tệp chứng cứ; điểm Luật THADS Điều 31.5 do người dùng ghi trong căn cứ, hệ thống không tự suy ra. Quyết định thu hồi: Trưởng VP ký, **2 ngày làm việc** sau khi chấm dứt/thanh lý (NĐ 151 Điều 46).
- Biểu mẫu: N-07, N-08. Sổ: **S-05**.

**Trong app:** ✅ nhiều đương sự/nghĩa vụ, kết quả từng phần bất biến, tài sản và sự kiện, chuyển hồ sơ qua phê duyệt rồi bàn giao, chấm dứt vụ việc (PR #168), hạn thu hồi, nháp N-07/N-08, đọc sổ S-05. ⬜ Kết thúc vụ việc theo Điều 46 "chưa đủ" theo báo cáo 22/10; mẫu chính thức nguyên văn.

---

## 8. Hạn pháp định (chung cho các nghiệp vụ)

`nghiệp vụ.md` yêu cầu theo dõi hạn nhưng **văn bản pháp luật không định nghĩa "ngày làm việc"**, nên đây là chỗ cần quyết định.

**🟡 Cách tính đã chốt theo đề xuất (21/10, chủ dự án cho Claude tự chọn, sẽ chỉnh sau):**
- Lịch làm việc **cấu hình theo văn phòng** (ngày trong tuần + danh sách nghỉ/lễ do Admin quản lý). **Thứ Bảy và Chủ nhật không tính** (🔒 chủ dự án đã chốt 16/10 về thứ Bảy).
- Hạn kết thúc **23:59:59 giờ Việt Nam** của ngày làm việc cuối.
- Hạn chỉ để **nhắc**, không tự chặn nghiệp vụ, không tự đổi trạng thái.
- Ngoại lệ "các bên thoả thuận khác": Admin/Trưởng VP ghi hạn thoả thuận kèm lý do.

| Hạn | Mốc bắt đầu | Thời hạn | Căn cứ (theo tài liệu dự án) |
|---|---|---|---|
| Cập nhật Vi bằng vào CSDL / gửi Sở Tư pháp | Ngày kết thúc lập vi bằng | 3 ngày làm việc | NĐ 151 Điều 30 |
| Cập nhật CSDL và gửi văn bản sửa lỗi N-11 cho người yêu cầu | Ngày lập N-11 | 2 ngày làm việc | Điều 31 |
| Báo kết quả tống đạt cho cơ quan yêu cầu | Lần tống đạt cuối hoàn thành | 2 ngày làm việc | Điều 26 (nghiệp vụ.md) / 25.2 (business-decisions) |
| Trưởng VP ra quyết định xác minh | Ngày ký hợp đồng xác minh | 3 ngày làm việc | Điều 35 |
| Quyết định thu hồi quyết định THA | Khi chấm dứt/thanh lý | 2 ngày làm việc | Điều 46 |

✅ Đã có trong app: lịch làm việc ở Quản trị, khối Nhắc hạn ở Tổng quan, đóng hạn / ghi hạn thoả thuận (`POST /office/deadlines/:id/{done,agree}`), hộp thông báo bền vững có đã đọc, nhắc cả công văn có hạn xử lý (PR #91, #100, #104, #116, #147, #168). ⬜ **Nhắc chỉ trong ứng dụng** (🔒 §52); chưa có kênh email/Zalo, và cron nhắc hạn trên `lo-api` do chủ dự án cấu hình.

---

## 9. Văn phòng chung

### 9.1 Công văn đến/đi và sổ quyết định (🔒 §46–48) — ✅ ~90%
- **Đến:** số/ký hiệu, ngày ban hành/nhận, nơi gửi, trích yếu, loại, người xử lý, hạn, tài liệu, kết quả; liên kết được với hồ sơ của bất kỳ nghiệp vụ nào.
- **Đi:** dự thảo, số/ký hiệu, nơi nhận, người trình, người ký, ngày ký, bản cuối, phương thức và bằng chứng gửi. Phân biệt **soạn / duyệt nội bộ / ký ban hành**.
- **Sổ quyết định:** tra theo số, ngày, loại, người ký, hồ sơ, thời gian; **không tự cho Văn phòng quyền ban hành biểu mẫu chỉ dành cho cơ quan nhà nước**.
- ✅ Công văn đi tự cấp số 🟡 `<stt>/<năm>/CV-THV` (PR #125), gắn hồ sơ sau khi tạo, giao người xử lý, đọc danh sách/chi tiết/tệp, nhắc hạn. ❓ Cần đối chiếu cách đánh số công văn thật của văn phòng.

### 9.2 Vật tư văn phòng (🔒 §50) — ✅ ~90%
Giấy in, mực in, văn phòng phẩm. Danh mục, nhập, xuất, theo dõi tồn, kiểm kê có điều chỉnh có lý do, lịch sử, theo địa điểm. **Xuất theo FIFO** (nhập trước, xuất trước), giữ nguồn lô, chặn xuất quá tồn. Không thành quản lý giá vốn hay kế toán kho.
- ✅ Nhập/xuất theo lô, lịch sử kèm nguồn lô, kiểm kê **theo phiên** (Trưởng VP duyệt mới ghi phiếu điều chỉnh), nhóm vật tư (PR #109, #127). Chỉ số lượng, không đơn giá; FIFO không xét hạn dùng.

### 9.3 Nhân sự và công việc nội bộ (🔒 §51–52)
Danh sách nhân viên, vai, địa điểm, trạng thái; khối lượng công việc, việc quá hạn/chờ người khác; dữ liệu cho sổ **S-06**. Hộp nhắc việc: hồ sơ chưa giao, chờ xác nhận thanh toán, chờ cấp số, chờ ký/dấu, thiếu scan cuối, cần liên hệ khách, đến hạn Sở, tống đạt/xác minh gần hạn, yêu cầu phê duyệt, sự cố. **Nhắc không đồng nghĩa chuyển trạng thái hay phê duyệt.**
- ✅ Hộp duyệt (có huy hiệu đếm), Việc của tôi (API việc được giao xuyên 4 nghiệp vụ, PR #118), Tổng quan có nhắc hạn và hoạt động theo địa điểm. ⬜ Tìm kiếm trên thanh trên và đếm huy hiệu một số mục menu chưa nối đủ API (theo ghi chú 23/10).

### 9.4 Phê duyệt (🔒 §58) — ✅ ~85%
Với đề nghị **chuyển hồ sơ** và **ủy quyền**: Admin hoặc Trưởng VP duyệt trên phần mềm (phương án B). Mỗi đề nghị ghi người đề nghị, căn cứ, lý do, tài liệu, người duyệt, thời điểm, kết quả; được từ chối, yêu cầu bổ sung hoặc chấp thuận; bước thực hiện sau duyệt ghi riêng. **Ngoại lệ:** thu hồi xác nhận MISA do Kế toán gửi thì **Admin** quyết.

### 9.5 Làm việc ngoài hiện trường (🔒 §53) — ⬜ ~45%
Xem hồ sơ được giao, ghi nhật ký tống đạt, đợt xác minh, bổ sung chứng cứ, sự kiện tài sản, kết quả nghĩa vụ, kiểm tra điều kiện hoàn tất, xử lý phê duyệt. Ghi dữ liệu ngoài hiện trường **không phải** ban hành quyết định pháp lý.
- ✅ Giao diện co giãn, API việc được giao. ⬜ Chưa có khung giao diện điện thoại riêng hoàn chỉnh; ảnh chụp thử ở `legal-office-mobile-proof/`.

---

## 10. Biểu mẫu, sổ sách, báo cáo

### 10.1 Biểu mẫu
**Mười một mẫu TP-THV-N** (🔒, theo Phụ lục III TT 08/2026): N-01 Hợp đồng Tống đạt · N-02 Biên bản Tống đạt · N-03 Hợp đồng lập Vi bằng · N-04 Vi bằng · N-05 Hợp đồng xác minh · N-06 Quyết định xác minh · N-07 Hợp đồng thi hành án · N-08 Biên bản giao nhận hồ sơ, tài liệu · N-09 Phụ lục tổ chức và hoạt động · N-10 Thống kê kết quả tổ chức THA · N-11 Văn bản sửa lỗi kỹ thuật Vi bằng.

- ✅ Thư viện sinh **bản NHÁP DOCX** cho N-01…N-08 và N-11, 34 test, endpoint `POST /office/forms/:code/draft` có kiểm quyền và audit (PR #102, #106). Bản in ghi phiên bản mẫu. Nguồn mẫu 🟡: bộ `bieu-mau-nghiep-vu-thua-hanh-vien.docx` mang dòng "ban hành kèm TT 08/2026/TT-BTP", cần đối chiếu lại với PDF thông tư.
- ❓ **N-09 và N-10 chưa làm đúng mẫu** vì thiếu file Excel gốc (🔒: không tự suy bố cục). Đến khi có file, chỉ xuất báo cáo thường và không gọi là mẫu chính thức.
- ⬜ Lưu tệp biểu mẫu đã sinh và giao diện hoàn chỉnh.
- **Thư viện tra cứu Phụ lục I–IX** (🔒): chỉ xem và tải, **không tự điền, ký, ban hành**; có phiên bản và hiệu lực. ✅ Có (~60%). *Lưu ý nhỏ:* `nghiệp vụ.md` §49 ghi "Thông tư 06/2026/TT-BTP", còn bộ file dự án là phụ lục kèm TT 08/2026; cần xác nhận lại tên văn bản.

### 10.2 Sổ sách (🔒 §55–56)

| Mã | Tên | Quản lý bởi |
|---|---|---|
| S-01 | Sổ theo dõi việc Tống đạt | Văn phòng |
| S-02 | Sổ theo dõi việc lập Vi bằng | Văn phòng |
| S-03 | Sổ theo dõi Vi bằng | **Sở Tư pháp** |
| S-04 | Sổ theo dõi việc xác minh điều kiện THA | Văn phòng |
| S-05 | Sổ theo dõi việc thi hành án | Văn phòng |
| S-06 | Sổ theo dõi việc sử dụng lao động | Văn phòng |

- Mở sổ **01/01**, khóa sổ **31/12**. Sổ điện tử được phép, nhưng **hàng tháng phải in, đóng quyển, đóng dấu giáp lai**. Mỗi dòng sổ truy được về hồ sơ, văn bản, kết quả tạo ra nó.
- **S-03 không phải sổ Văn phòng tự quản lý** thay Sở Tư pháp (🔒). App chỉ có danh sách việc theo dõi gửi/cập nhật Sở và kết quả xử lý, không có sổ S-03.
- ✅ Đọc sổ S-01/02/04/05 (PR #111), xuất Excel và PDF (font DejaVu nhúng, dấu tiếng Việt đã xem thật; PR #120, #136); điền họ tên + số Thẻ THV vào cột THV (PR #149). ⬜ S-06 chưa có sổ in. ❓ Chuyển tiếp từ sổ giấy lịch sử sang hệ thống chưa chốt cách làm.

### 10.3 Báo cáo (🔒 §57) — ✅ ~85%
Phải bao phủ cả bốn nghiệp vụ và quản lý văn phòng, **mỗi đơn vị đếm riêng**: hồ sơ ≠ văn bản ≠ đợt xác minh ≠ nghĩa vụ ≠ vụ việc. Ví dụ không dùng số yêu cầu tống đạt thay số văn bản đã tống đạt. Xuất Excel/PDF/in. **Không có báo cáo thu chi, công nợ, quá hạn thanh toán.**
- ✅ Báo cáo tổng hợp theo kỳ và chi nhánh, theo THV/chi nhánh (PR #123), kỳ công văn, vật tư, sử dụng lao động (PR #141), xuất Excel và PDF.

---

## 11. Quản trị (Admin) trong app

Mục **Quản trị** gom: lịch làm việc và ngày nghỉ (hạn pháp định), cấu hình văn phòng (`/office/settings`, tên pháp lý, trường cấu hình theo tenant), cấp vai/chi nhánh theo nguyên tắc hai người, thẻ THV (họ tên, số Thẻ), danh bạ thành viên (chỉ Admin đọc), cài đặt thư (SMTP) cho đăng nhập link email. Quyền ký `legal_signer` do Admin cấp.

- 🟡 Tên pháp lý hiển thị tạm: "Văn phòng Thi hành án dân sự Doanh nghiệp tư nhân Hai Bà Trưng" (theo báo giá); là trường cấu hình, ❓ **chờ đối chiếu giấy đăng ký** trước khi in mẫu chính thức.
- ⬜ Quản lý "địa điểm hoạt động" (§4.1) mới ở mức chi nhánh có sẵn, chưa có màn tạo/sửa địa điểm đầy đủ. ⬜ Cron nhắc hạn, SMTP, `MAIL_SETTINGS_KEY`, `PUBLIC_WEB_URL` trên `lo-api` do chủ dự án.

---

## 12. Lưu trữ, bảo mật và cổng chặn vận hành thật

- Hồ sơ giấy vẫn do văn phòng quản lý; tài liệu điện tử để tra cứu, theo dõi nội bộ. **Bản scan không mặc nhiên là bản gốc điện tử ký số hợp pháp** (🔒 §61).
- Chỉ người được giao nhiệm vụ và có quyền phù hợp mới tiếp cận hồ sơ (🔒 §63); kho tệp riêng (R2/đĩa), phân quyền tải (✅, bản chạy dùng volume 6 GB).
- 🔴 **Cổng chặn — Điều 50 NĐ 151:** văn phòng lưu trữ hồ sơ **tại trụ sở**; lưu **ngoài trụ sở phải có văn bản đồng ý của Sở Tư pháp**. Khách **chưa xin** chấp thuận. Hậu quả: **không dùng dữ liệu thật trên cloud**; bản Northflank chỉ dùng dữ liệu giả. Đây là việc pháp lý của khách, không phải việc code, và cần xong trước khi vận hành thật (🔒 tiêu chí nghiệm thu 14).
- Thời hạn bảo quản theo pháp luật về lưu trữ; không tự đặt thời hạn chung.
- Chấp nhận của khách/pháp lý đối với bản in chính thức là trạng thái riêng, chưa có.

**Các ca phải chặn hoặc chưa được coi là hoàn tất** (🔒 §59, hệ thống thể hiện bằng ràng buộc DB và API, không chỉ giao diện):

| Trường hợp | Quy tắc |
|---|---|
| Vi bằng chưa có THV phụ trách | Không làm bước pháp lý dành cho THV phụ trách |
| Chưa có xác nhận thanh toán đủ hợp lệ | Văn thư không cấp số |
| Xác nhận MISA đang bị đề nghị thu hồi | Tạm chặn trả vi bằng chưa bàn giao thực tế |
| Chưa xác nhận ký/dấu, hoặc thiếu scan cuối | Không ghi "Đã trả" |
| Đã liên hệ khách nhưng chưa bàn giao | Không ghi "Đã trả" |
| Tống đạt không gặp người nhận | Không tự ghi thành công |
| Xác minh thiếu căn cứ | Không tự kết luận xong |
| Ủy quyền thiếu văn bản đồng ý | Không hoàn tất ủy quyền |
| THA chỉ có đề nghị biện pháp | Không ghi đã áp dụng |
| Một nghĩa vụ xong | Không mặc nhiên xong cả vụ |
| Chuyển hồ sơ chưa bàn giao thực tế | Không ghi hoàn tất chuyển |

---

## 13. Tóm tắt trạng thái theo phân hệ (số liệu 22/10, ước lượng)

| Phân hệ | % | Còn thiếu chính |
|---|---|---|
| Vi bằng | ~90 | Bản in theo mẫu chính thức; một số API chưa có màn |
| Tống đạt | ~75 | Mẫu chính thức; ghi gửi kết quả cho cơ quan |
| Xác minh | ~70 | Mẫu chính thức |
| Tổ chức THA | ~75 | Kết thúc vụ việc đủ Điều 46; mẫu chính thức |
| Khách hàng & hợp đồng | ~85 | Cột số hồ sơ theo khách; danh bạ chủ thể chung |
| Công văn | ~90 | Đối chiếu mẫu số công văn thật |
| Vật tư | ~90 | — |
| Phê duyệt | ~85 | — |
| Hiện trường | ~45 | Khung giao diện điện thoại |
| Tài khoản & phân quyền | ~85 | Rà bảng quyền thật, 5 tài khoản thử |
| Biểu mẫu N / sổ S / TT | ~45 (TT ~60) | N-09/N-10 cần Excel gốc; lưu tệp; S-06 in |
| Nhắc hạn & ngày làm việc | ~90 | Kênh ngoài ứng dụng |
| Báo cáo | ~85 | N-09/N-10 |

Các con số này đo **khối lượng code**, không phải mức sẵn sàng vận hành: báo cáo 16/10 ước mức sẵn sàng thật còn thấp vì chưa qua cổng Điều 50, chưa có mẫu/sổ chính thức đã được khách chấp nhận, chưa có UAT trọn bốn nghiệp vụ trên bản chạy.

---

## 14. Việc cần chủ dự án quyết hoặc cung cấp

Xếp theo mức ảnh hưởng:

1. **Điều 50:** khi nào khách xin văn bản đồng ý của Sở Tư pháp (chặn dữ liệu thật). ❓
2. **File Excel gốc N-09, N-10** và chỉ tiêu báo cáo kèm theo. ❓
3. **Số cuối của sổ Vi bằng giấy** và cách chuyển tiếp dữ liệu lịch sử. ❓
4. **Giấy đăng ký** của văn phòng (tên pháp lý, địa chỉ) để in mẫu. ❓
5. **Phụ lục hợp đồng:** duyệt hoặc chỉnh 3 câu mở ở mục 3.2. 🟡
6. **Bảng quyền:** Admin có giữ việc phân công Tống đạt/Xác minh/THA không; ai giữ `legal_signer`. 🟡
7. **Đăng nhập Admin:** SMTP, `PUBLIC_WEB_URL`, cron nhắc hạn trên `lo-api`; chọn cách đăng nhập chính thức. ⬜
8. **Mẫu chính thức:** xác nhận bộ `.docx` là nguồn đúng so với PDF TT 08/2026; xác nhận tên văn bản "TT 06" hay "TT 08" cho Phụ lục I–IX. ❓
9. **Có kênh nhắc ngoài ứng dụng** (email/Zalo) cho nhân viên không (hiện chỉ trong ứng dụng; không gửi cho khách). ❓
10. **Tạo 5 tài khoản thử** và chạy UAT trọn bốn nghiệp vụ trên bản chạy. ⬜
11. **Đối chiếu số điều NĐ 151** cho hạn báo kết quả tống đạt (Điều 26 hay 25.2) và các điều khác trước khi in lên sản phẩm. ❓

> **Nguyên tắc khi chưa có căn cứ (🔒 §XIII):** ghi nhận là "chưa được xác minh". Không tự đặt ra thẩm quyền, thời hạn, giá trị pháp lý hay nghĩa vụ mới. Mọi mục 🟡 trong tài liệu này là giả định có thể sửa, không phải quy tắc pháp lý.
