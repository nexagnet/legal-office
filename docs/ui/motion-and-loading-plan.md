# Kế hoạch phản hồi tức thì và hiệu ứng tải (apps/web)

> Trạng thái: **ĐANG TRIỂN KHAI** (Figma N14 đã duyệt). Tiến độ ở mục 9.
> Phạm vi: chỉ giao diện `apps/web`. Tối ưu backend là kế hoạch riêng (mục 6 chỉ liệt kê).

## 0. Vấn đề và nguyên nhân gốc

Cảm giác "dơ dơ" khi bấm là do ba chuyện cộng lại, đều thấy được trong code:

1. **Bấm xong, màn hình đứng im cho tới khi máy chủ trả lời.** Toàn bộ dữ liệu được lấy ở máy chủ web (Server Component, `cache: 'no-store'`). Điều hướng chỉ đổi khi dữ liệu trang đích về đủ. Cả repo chỉ có **một** `app/loading.tsx`.
2. **`app/loading.tsx` hầu như không bao giờ hiện.** `app/layout.tsx` là `force-dynamic` và tự `await currentSession()` (gọi `GET /auth/me`) rồi `await loadPendingApprovalCount()` **trước khi** render. Khung loading của trang con nằm *bên trong* layout nên không thể hiện khi layout còn đang chờ. Mỗi lần chuyển trang, người dùng chờ hai lần gọi API nối đuôi nhau, nhìn trang cũ đứng im.
3. **Trang con còn gọi tiếp, nối đuôi.** `currentSession()` bị gọi lại trong từng `page.tsx` (không có `React.cache`, nên `/auth/me` gọi 2 lần cho mỗi lần điều hướng). `vi-bang/[id]/case-frame.tsx` gọi tuần tự: session, hồ sơ, danh sách thay đổi, tiến độ. `app/page.tsx` chờ `loadCases` xong mới chạy `Promise.all` bốn lời gọi còn lại.

Phía thao tác ghi: `useAction` có `busy` (35 chỗ `router.refresh()`), nhưng `Button` không có trạng thái đang chạy (không spinner, chỉ `disabled:opacity-60`), không có toast (kết quả là dòng chữ `notice` tại chỗ), `router.refresh()` lại chạy toàn bộ chuỗi chờ ở điểm 2 mà không có hiệu ứng nào.

Điểm tốt đã có, tận dụng được: lớp `.skeleton` (animation `skeleton`), khối `prefers-reduced-motion` toàn cục trong `globals.css`, Radix Dialog/Dropdown/Popover, `error.tsx` có nút "Thử lại", thư mục `@modal` cho thao tác hồ sơ.

## 1. Nguyên tắc phản hồi (ngân sách thời gian)

| Mốc | Quy tắc |
|---|---|
| 0 đến 100 ms | Mọi thao tác bấm phải có phản hồi thị giác ngay: trạng thái `:active` (lún nhẹ), mục menu đích sáng lên (pending) ngay khi bấm, không đợi mạng. |
| 100 đến 300 ms | Thanh tiến trình mảnh trên cùng bắt đầu chạy (trễ 100 ms để điều hướng nhanh không nháy). Nút đang gửi hiện spinner. |
| 300 ms trở lên | Hiện skeleton đúng bố cục khối đang chờ. Skeleton chỉ hiện khi chờ quá 200 ms, và đã hiện thì giữ tối thiểu 300 ms (chống nháy). |
| 1 giây trở lên | Thêm dòng chữ nhỏ "Đang tải…" trong vùng `aria-live`. |
| 8 giây trở lên | Chuyển sang trạng thái lỗi/thử lại (mục 5). |

Quy tắc đi kèm:
- Nút gửi: bấm một lần thì khoá ngay (đồng bộ, bằng `useTransition`/`busy`), hiện spinner và đổi nhãn ("Đang lưu…"). Giữ nguyên chiều rộng nút để không nhảy.
- Không bao giờ xoá nội dung cũ rồi để trống: giữ nội dung cũ mờ nhẹ (opacity 0.6, không nhấp nháy) trong lúc nạp bản mới (stale-while-revalidate).
- Mọi phản hồi phải đọc được bằng trình đọc màn hình (`aria-busy`, `role="status"`).

## 2. Skeleton theo từng loại khối

Nguyên tắc: skeleton **dùng cùng component bố cục** với bản thật (cùng lưới, cùng chiều cao hàng) để không nhảy layout (mục tiêu CLS < 0.1). Làm thành bộ `components/skeleton/*` dùng lớp `.skeleton` hiện có, thêm `Skeleton` của shadcn chỉ nếu cần (nó chỉ là một `div`, không cần thư viện).

| Khối | Skeleton | Đặt ở |
|---|---|---|
| Khung trang (đầu trang + tiêu đề) | Tiêu đề thật hiện ngay (biết từ đường dẫn), phần dữ liệu là skeleton | `loading.tsx` từng nhóm route |
| Thẻ KPI (`KpiStrip`, `StatCard`) | Giữ đúng 4 ô, số là thanh xám cùng chiều cao chữ số | trong Suspense của khối |
| Bảng (`CaseTable`, domain tables, `MyWorkList`) | 8 hàng, cột theo `columns` thật, cột trạng thái là viên thuốc xám | `loading.tsx` của trang danh sách |
| Thanh tab / lọc trạng thái | Hiện nhãn tab thật ngay (tĩnh), chỉ số đếm là skeleton | giữ ngoài Suspense |
| Chi tiết hồ sơ (`DetailFrame`, `CaseBanner`, `CaseSteps`) | Banner + stepper 6 bước + 2 cột thông tin | `vi-bang/[id]/loading.tsx` |
| Drawer/Sheet/Dialog (`@modal`) | Khung drawer mở ngay (animation vào), nội dung bên trong là skeleton field | `@modal/**/loading.tsx` |
| Dashboard theo vai (Tổng quan) | 3 khối độc lập: KPI, hàng việc, hoạt động địa điểm; mỗi khối một Suspense | `app/page.tsx` |
| Menu/huy hiệu Hộp duyệt | Không skeleton; huy hiệu nạp sau (mục 3.3) | `AppShell` |

## 3. Chiến lược dữ liệu (làm giảm thời gian chờ thật)

### 3.1 Bỏ chặn ở layout (tác động lớn nhất)
- Bọc `currentSession` bằng `React.cache` để một yêu cầu chỉ gọi `/auth/me` **một lần** (layout + page dùng chung). Đây là thay đổi vài dòng, không đổi hành vi.
- Layout chỉ chờ session (cần cho menu). Huy hiệu Hộp duyệt chuyển sang component con trong `<Suspense fallback={null}>`, không chặn render.
- Khi layout không còn chờ lâu, `loading.tsx` của trang con mới thực sự hiện.

### 3.2 Streaming theo khối thay vì chặn cả trang
- Mỗi trang tách phần "khung" (tiêu đề, tab) khỏi phần "dữ liệu"; phần dữ liệu là Server Component async riêng trong `<Suspense fallback={<Skeleton… />}>`.
- Chạy song song: `case-frame.tsx` đổi 3 lời gọi tuần tự thành `Promise.all`; `app/page.tsx` bắt đầu `loadCases` cùng lúc với bốn lời gọi còn lại (hoặc đẩy mỗi khối vào Suspense riêng).
- Dữ liệu phụ (lịch sử, tài liệu, nhật ký liên hệ) nạp trong Suspense riêng, không chặn banner/stepper.

### 3.3 Prefetch
- `next/link` đã prefetch theo viewport ở production cho route tĩnh; với route động (`force-dynamic`) chỉ prefetch tới `loading.tsx`. Vì vậy `loading.tsx` ở từng nhóm route cũng là cách làm cho điều hướng *tức thì* (khung hiện ngay từ prefetch).
- Hover/focus prefetch: gọi `router.prefetch(href)` khi `onPointerEnter` trên dòng bảng và mục menu (chỉ trên thiết bị có chuột).
- Không prefetch thao tác ghi, không prefetch trang nặng khi `navigator.connection.saveData`.

### 3.4 Cache và stale-while-revalidate
- Dữ liệu tham chiếu ít đổi (danh sách THV, signers, cấu hình văn phòng, chi nhánh): thay `cache: 'no-store'` bằng `next: { revalidate: 60, tags: [...] }`, kèm cookie làm khoá; thao tác ghi gọi `revalidateTag`. **Cần duyệt riêng về an toàn quyền** vì các lời gọi này phụ thuộc cookie người dùng; mặc định giữ `no-store` cho dữ liệu hồ sơ.
- Phía client (danh sách có lọc/tìm, drawer cần mở lại nhiều lần): cân nhắc **TanStack Query** (`staleTime` 30 s, hiện bản cũ trong lúc nạp bản mới, `placeholderData: keepPreviousData`). Chỉ thêm khi gặp màn cần (tìm kiếm palette, danh sách lọc), không đưa vào toàn app vì phần lớn dữ liệu đang ở Server Component.

### 3.5 Optimistic update (chỉ thao tác nhẹ, có thể hoàn tác)
Dùng `useOptimistic` + `useTransition` của React 19 (đã có, không thêm thư viện). Áp dụng cho: đánh dấu đã đọc, ghim/bỏ ghim, ghi chú liên hệ (`ContactLog`), gán người xử lý (`AssignHandler`), đổi trạng thái nhắc hạn. **Không** áp dụng cho thao tác pháp lý hoặc tiền: duyệt, ký, đóng dấu, tống đạt, thu hồi MISA, huỷ hồ sơ. Các thao tác này hiện spinner và chờ máy chủ xác nhận.
Khi lỗi: hoàn về trạng thái cũ, rung nhẹ dòng đó và hiện toast lỗi có nút thử lại.

## 4. Chuyển động

Mục tiêu: chuyển động **báo hiệu trạng thái**, không trang trí.

| Thành phần | Thời lượng | Easing | Ghi chú |
|---|---|---|---|
| Pressed của nút/hàng/mục menu | 80 ms | ease-out | `transform: scale(.98)` + đổi nền |
| Spinner nút | vòng 700 ms | linear | `lucide-react` `Loader2` + `animate-spin` (Tailwind sẵn có) |
| Thanh tiến trình trên cùng | trườn lên 90% rồi chờ | ease-out, hoàn tất 150 ms | cao 2px, màu accent |
| Skeleton shimmer | 1.4 s | ease-in-out | giữ lớp hiện có; 1 gradient, không phải JS |
| Skeleton thành nội dung | 150 ms | ease-out | chỉ `opacity` |
| Drawer/Sheet vào-ra | 220 ms vào, 160 ms ra | cubic-bezier(.16,1,.3,1) | `transform`/`opacity` (Radix + CSS `data-state`) |
| Dialog | 160 ms | ease-out | scale .97 đến 1 + opacity |
| Toast | 200 ms vào, 150 ms ra | ease-out | trượt từ dưới/phải |
| Thay đổi danh sách (xoá hàng) | 180 ms | ease-in-out | chỉ khi optimistic; cao hàng co lại bằng `grid-template-rows` |

Quy tắc: chỉ animate `transform`, `opacity` (theo `.claude` web rules); không animate `width/height/margin`. Tất cả chuyển động bật `@media (prefers-reduced-motion: reduce)`: bỏ shimmer và trượt, giữ đổi opacity tức thì và spinner dạng tĩnh/nhấp nhẹ. Khối reduce-motion toàn cục hiện có (`globals.css:285`) đã đủ làm nền; bổ sung kiểm thử.

### Thư viện (đã tìm trước khi tự viết)

| Nhu cầu | Quyết định | Lý do |
|---|---|---|
| Thanh tiến trình chuyển trang | **`nextjs-toploader`** (hoặc `next-nprogress-bar`), chọn khi triển khai sau khi kiểm tra tương thích Next 15.5/React 19 | Hoạt động trên App Router, ~2 KB; tự viết dễ sai với back/forward và link ngoài. Phương án không thêm thư viện: `useLinkStatus` của Next 15.3+ cho trạng thái pending từng `<Link>` (dùng cho sáng mục menu), kết hợp thanh tự dựng. Đề xuất: **dùng cả hai**, thanh bằng thư viện, pending từng link bằng `useLinkStatus`. |
| Toast | **`sonner`** | Nhỏ, truy cập tốt, có action "Thử lại", tôn trọng reduced-motion. Không có toast nào trong repo hiện tại. |
| Skeleton | Giữ `.skeleton` CSS hiện có, thêm component bọc | Không cần thư viện. |
| Chuyển động phức tạp | **Không thêm `motion`/framer-motion** ở đợt đầu | Drawer/Dialog/Toast/skeleton làm được bằng CSS + Radix `data-state` (Radix đã có). Chỉ xét `motion` nếu cần layout animation danh sách (~18 KB gz), kèm duyệt. |
| Dữ liệu client | **TanStack Query** chỉ khi cần (mục 3.4) | Server Component là mặc định. `@tanstack/react-table` đã có. |
| Chuyển trang mượt | `viewTransition` của Next (thử nghiệm) = **HOLD** | Chưa ổn định, không cần cho mục tiêu này. |

## 5. Toast, lỗi và thử lại

- **Thành công**: toast ngắn 3 s ("Đã lưu"), thay cho dòng `notice` tại chỗ. Thao tác quan trọng (duyệt, ký) giữ thêm dòng xác nhận trong trang.
- **Lỗi thao tác ghi**: toast lỗi không tự tắt, có nút "Thử lại", nội dung lấy từ `messageFor(code)` hiện có (giữ nguyên bảng thông điệp tiếng Việt). Lỗi theo trường vẫn hiện ở trường.
- **Lỗi nạp khối**: mỗi khối Suspense có error boundary riêng (`error.tsx` theo route + boundary cục bộ cho khối phụ), hiện thẻ "Không tải được [tên khối]" + nút "Tải lại khối này" (`router.refresh()` trong `startTransition`). Một khối hỏng không làm trắng cả trang.
- **Mất kết nối / quá 8 s**: banner mảnh "Kết nối chậm, đang thử lại…", tự thử lại 2 lần (1 s, 3 s), sau đó hiện lỗi. Thao tác ghi **không tự thử lại** (tránh gửi trùng); chỉ thử lại khi người dùng bấm, kèm khoá chống bấm đôi.
- Hết phiên (401) giữ hành vi hiện có (về đăng nhập), thêm toast "Phiên đã hết hạn".

## 6. Điểm nghẽn quan sát được (chỉ liệt kê, tối ưu backend là kế hoạch khác)

**Đo trên bản deploy: CHƯA đo được.** Môi trường cloud của phiên này bị chặn tới `*.code.run` (proxy từ chối). Việc đo cần chạy từ máy chủ dự án (mục 7, PR 0). Bảng dưới là **phân tích từ code**, không phải số đo.

| # | Quan sát (từ code) | Đề xuất |
|---|---|---|
| B1 | Mỗi điều hướng gọi `/auth/me` **2 lần** (layout và page) và `approvals/pending` đếm huy hiệu ngay trong layout. | `React.cache` + Suspense huy hiệu (mục 3.1). Backend: cho `/auth/me` trả kèm số huy hiệu hoặc cache ngắn theo phiên. |
| B2 | Chi tiết hồ sơ gọi 4 API tuần tự (session, case, changes, progress). | Song song hoá phía web; backend: endpoint gộp `GET /vibang/cases/:id/summary`. |
| B3 | Tổng quan gọi `vibang/cases?limit=100` rồi 4 API nữa; số liệu KPI tính ở web từ 100 hồ sơ. | Backend: endpoint số liệu tổng hợp theo vai; phân trang đúng nghĩa. |
| B4 | Mọi fetch dùng `no-store`, không có cache cho dữ liệu tham chiếu (THV, signers, cấu hình). | Cache ngắn có tag (mục 3.4); backend: `ETag`/`Cache-Control: private, max-age`. |
| B5 | Thao tác ghi xong là `router.refresh()` chạy lại toàn bộ trang (35 chỗ). | Server Action + `revalidateTag` hẹp, hoặc cập nhật cục bộ (optimistic) cho thao tác nhẹ. |
| B6 | Free Northflank dùng chung: khởi động nguội (cold start) và độ trễ web→api qua mạng công cộng có thể là phần lớn thời gian. | Đo và ghi lại `API_URL` nội bộ (private network) nếu có; giữ `lo-api` luôn chạy. |
| B7 | Proxy `rewrites` `/api/:path*` cho mọi thao tác ghi từ trình duyệt thêm một bước nhảy. | Đo; cân nhắc nối thẳng nếu CORS/cookie cho phép (cần duyệt vì liên quan SameSite=Strict). |

## 7. Thứ tự triển khai (PR nhỏ), ước lượng, kiểm chứng

Mỗi PR độc lập, risk R1 (chỉ giao diện, không đổi quyền/nghiệp vụ), có ảnh quay màn hình hoặc kết quả đo đính kèm.

| PR | Nội dung | Ước lượng | Kiểm chứng |
|---|---|---|---|
| 0 | **Công cụ đo** `scripts/measure-latency.mjs` (curl nhiều lần: TTFB các trang chính và API qua `/api`, p50/p95) + ghi số nền vào tài liệu này | 0,5 ngày | Số đo thật trên deploy, ghi vào mục 6 |
| 1 | `React.cache` cho `currentSession`; huy hiệu vào Suspense; `Promise.all` ở `case-frame` và Tổng quan | 0,5 ngày | Số cuộc gọi `/auth/me` mỗi điều hướng giảm 2 xuống 1; test đơn vị; đo TTFB trước/sau |
| 2 | Thanh tiến trình trên cùng + `useLinkStatus` cho menu + trạng thái pressed toàn cục | 0,5 ngày | Quay video click đến phản hồi < 100 ms; kiểm thử reduced-motion |
| 3 | `Button` có `loading` (spinner, khoá, giữ chiều rộng) + áp vào `useAction` | 0,5 ngày | Test: bấm đôi chỉ gửi 1 yêu cầu; axe |
| 4 | Bộ skeleton + `loading.tsx` theo nhóm route (bảng, KPI, chi tiết hồ sơ, drawer) | 1,5 ngày | CLS < 0,1 (Lighthouse); ảnh chụp 320/390/768/1024/1440 |
| 5 | Suspense theo khối cho Tổng quan và Chi tiết hồ sơ | 1 ngày | Khung hiện < 300 ms khi API chậm giả lập (độ trễ 2 s) |
| 6 | Toast `sonner` + lỗi theo khối có "Tải lại" | 1 ngày | Test lỗi giả lập; kiểm tra thông điệp `messageFor` |
| 7 | Optimistic cho 4 thao tác nhẹ (mục 3.5) | 1 ngày | Test hoàn tác khi lỗi |
| 8 | Prefetch hover/viewport + cache tham chiếu có tag (cần duyệt) | 1 ngày | Số yêu cầu thừa; đo INP |

Tổng ước lượng khoảng 7 ngày công, nhận kết quả thấy được ngay từ PR 1 đến 3 (khoảng 1,5 ngày).

**Cách đo chung**: Lighthouse (mobile, throttling Slow 4G) trên `/`, `/vi-bang`, `/vi-bang/:id`, `/viec-cua-toi`; INP < 200 ms, CLS < 0,1, LCP < 2,5 s; quay video thao tác thật (bấm menu, mở drawer, gửi form) trước và sau; thử với độ trễ API giả lập 1 s và 3 s (proxy `API_URL` có chèn trễ ở môi trường cục bộ) để chứng minh phản hồi không phụ thuộc tốc độ backend.

## 8. Cần chủ dự án quyết định

1. Duyệt thứ tự PR 0 đến 8 (đề xuất bắt đầu từ PR 1 đến 3).
2. Duyệt thêm hai thư viện: `nextjs-toploader` và `sonner` (đã tìm trước; không thêm `motion` ở đợt đầu).
3. Có cần vẽ khung Figma bổ sung (page N14: thanh tiến trình, skeleton từng khối, toast, trạng thái nút) trước khi code không? Đề xuất: **có** cho skeleton và toast để đối chiếu bố cục; thanh tiến trình và spinner nút đơn giản, không cần.
4. Cho phép cache có tag cho dữ liệu tham chiếu (PR 8) hay giữ `no-store` toàn bộ.

## 9. Tiến độ triển khai

| PR | Nội dung |
|---|---|
| #215-#217 | Gỡ chặn layout, dedupe `/auth/me`, thanh tiến trình trên cùng, spinner menu, trạng thái nhấn |
| #218 | Nút có `loading`, chống bấm đúp |
| #220 | Skeleton theo từng màn (`loading.tsx`) |
| #221 | Ghi liên hệ hiện ngay (optimistic) và toast |
| (PR này) | `scripts/measure-latency.mjs` để đo độ trễ thật |

Chưa làm, có chủ ý:

- Suspense theo từng khối: chờ số đo thật từ script trên.
- Prefetch khi rê chuột: `loading.tsx` và prefetch theo viewport đã phủ phần lớn.
- Cache dữ liệu tham chiếu: ghi đi qua rewrite `/api` nên lớp web không huỷ cache được, có rủi ro dữ liệu cũ.
