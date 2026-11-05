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

/** Mốc nhanh của ô Thời gian: lưu trên thanh địa chỉ dạng tương đối (`ky=thang-nay`) nên bộ lọc đã lưu luôn là "tháng này" của lúc mở. */
export const DMS_PERIODS = [
  { key: 'hom-nay', label: 'Hôm nay' },
  { key: 'tuan-nay', label: 'Tuần này' },
  { key: 'thang-nay', label: 'Tháng này' },
  { key: 'thang-truoc', label: 'Tháng trước' },
  { key: 'quy-nay', label: 'Quý này' },
  { key: 'nam-nay', label: 'Năm nay' },
] as const;
export type DmsPeriod = (typeof DMS_PERIODS)[number]['key'];

export const isDmsPeriod = (raw: string | undefined): raw is DmsPeriod =>
  DMS_PERIODS.some((p) => p.key === raw);

const two = (n: number) => String(n).padStart(2, '0');
const localOf = (y: number, mo: number, d: number, h: number, mi: number): string => {
  // Date.UTC chuẩn hóa ngày tràn tháng (ví dụ ngày 0 của tháng sau = ngày cuối tháng trước).
  const t = new Date(Date.UTC(y, mo, d, h, mi));
  return `${t.getUTCFullYear()}-${two(t.getUTCMonth() + 1)}-${two(t.getUTCDate())}T${two(t.getUTCHours())}:${two(t.getUTCMinutes())}`;
};

/** Khoảng của một mốc nhanh theo giờ Việt Nam, đủ hai đầu (00:00 đến 23:59). Tuần tính từ thứ Hai. */
export function periodRange(ky: DmsPeriod, now: Date = new Date()): { tu: string; den: string } {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const y = vn.getUTCFullYear();
  const m = vn.getUTCMonth();
  const d = vn.getUTCDate();
  const span = (a: [number, number, number], b: [number, number, number]) => ({
    tu: localOf(a[0], a[1], a[2], 0, 0),
    den: localOf(b[0], b[1], b[2], 23, 59),
  });
  switch (ky) {
    case 'hom-nay':
      return span([y, m, d], [y, m, d]);
    case 'tuan-nay': {
      const back = (vn.getUTCDay() + 6) % 7; // thứ Hai = 0
      return span([y, m, d - back], [y, m, d - back + 6]);
    }
    case 'thang-nay':
      return span([y, m, 1], [y, m + 1, 0]);
    case 'thang-truoc':
      return span([y, m - 1, 1], [y, m, 0]);
    case 'quy-nay': {
      const q = Math.floor(m / 3) * 3;
      return span([y, q, 1], [y, q + 3, 0]);
    }
    case 'nam-nay':
      return span([y, 0, 1], [y, 12, 0]);
  }
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
  /** Mốc nhanh đang dùng (đã kiểm tra); có thì `tu`/`den` là khoảng của mốc đó tại thời điểm xem. */
  readonly ky?: DmsPeriod;
}

export function dmsDateRange(
  rawTu: string | undefined,
  rawDen: string | undefined,
  rawKy?: string,
  now: Date = new Date(),
): DmsDateRange {
  const ky = isDmsPeriod(rawKy) ? rawKy : undefined;
  const preset = ky ? periodRange(ky, now) : undefined;
  const tu = preset ? preset.tu : cleanLocalDateTime(rawTu);
  const den = preset ? preset.den : cleanLocalDateTime(rawDen);
  const from = tu ? new Date(msOf(tu)).toISOString() : undefined;
  const to = den ? new Date(msOf(den) + 60_000).toISOString() : undefined;
  return {
    tu,
    den,
    from,
    to,
    inverted: Boolean(tu && den && msOf(tu) > msOf(den)),
    ky,
  };
}
