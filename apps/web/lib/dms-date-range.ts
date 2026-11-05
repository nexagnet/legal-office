/**
 * Lọc danh sách hồ sơ theo khoảng ngày giờ chính xác (đến phút, giờ Việt Nam).
 * Phần thuần (không đụng máy chủ): dùng được ở cả trang máy chủ và thành phần trình duyệt.
 *
 * Giá trị trên thanh địa chỉ có dạng `YYYY-MM-DDTHH:mm` (đúng giá trị của ô `datetime-local`), hiểu là giờ Việt Nam (UTC+7).
 * API lọc theo thời điểm ghi sổ của hồ sơ (nháp chưa ghi sổ thì theo giờ tạo): `from` tính cả mốc, `to` không tính mốc.
 */

const LOCAL_DT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const VN_OFFSET_MS = 7 * 3_600_000;

/** Chuỗi ô `datetime-local` hợp lệ (ngày giờ có thật, năm 2000 đến 2100) thì trả lại nguyên văn, ngược lại `undefined`. */
export function cleanLocalDateTime(raw: string | undefined): string | undefined {
  const m = LOCAL_DT.exec((raw ?? '').trim());
  if (!m) return undefined;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  if (y < 2000 || y > 2100) return undefined;
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi));
  const same =
    t.getUTCFullYear() === y &&
    t.getUTCMonth() === mo - 1 &&
    t.getUTCDate() === d &&
    t.getUTCHours() === h &&
    t.getUTCMinutes() === mi;
  return same ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : undefined;
}

/** Mili giây (UTC) của một giờ Việt Nam đã được `cleanLocalDateTime` xác nhận. */
function msOf(local: string): number {
  const [date, time] = local.split('T') as [string, string];
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = time.split(':').map(Number) as [number, number];
  return Date.UTC(y, mo - 1, d, h, mi) - VN_OFFSET_MS;
}

export interface DmsDateRange {
  /** Giá trị đã làm sạch của hai ô (để điền lại vào form và giữ trên liên kết). */
  readonly tu?: string;
  readonly den?: string;
  /** Tham số `from` / `to` gửi API (ISO UTC). `to` là mốc sau phút "Đến" nên hồ sơ lúc 17:30:40 vẫn thuộc "đến 17:30". */
  readonly from?: string;
  readonly to?: string;
  /** "Từ" muộn hơn "Đến": không thể có kết quả, giao diện nên báo. */
  readonly inverted: boolean;
}

export function dmsDateRange(rawTu: string | undefined, rawDen: string | undefined): DmsDateRange {
  const tu = cleanLocalDateTime(rawTu);
  const den = cleanLocalDateTime(rawDen);
  const from = tu ? new Date(msOf(tu)).toISOString() : undefined;
  const to = den ? new Date(msOf(den) + 60_000).toISOString() : undefined;
  return {
    tu,
    den,
    from,
    to,
    inverted: Boolean(tu && den && msOf(tu) > msOf(den)),
  };
}
