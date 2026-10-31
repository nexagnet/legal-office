import Link from 'next/link';
import type { DmsBookRow, DmsBookSpec, DmsCaseRow } from '../lib/dms';
import { bookCell, scanState } from '../lib/dms';

/** Tên cột sổ gọn cho bảng danh sách (Figma): bỏ phần chú thích trong ngoặc, viết thường chữ hoa đầu câu. */
const shortHeading = (h: string) => {
  const t = h.replace(/\s*\(.*?\)/g, '').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const fmt = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });

/**
 * Bảng hồ sơ DMS: MỘT hàng là MỘT hồ sơ; số tài liệu và số tệp scan hiển thị tách bạch (Figma "DMS CANONICAL").
 * Nháp và nháp đã hủy không có STT và không vào xuất sổ, nên không hiện cột STT ở đây.
 */
export function DmsCaseTable({
  rows,
  caption,
  basePath,
  book,
  sttLabel = 'STT',
}: {
  /** Tên cột số thứ tự: "Số đến" cho sổ Văn bản đến, còn lại "STT". */
  readonly sttLabel?: string;
  readonly rows: readonly DmsCaseRow[];
  readonly caption: string;
  /** Đường dẫn trang miền (vd `/dms/vi-bang`); có thì tên hồ sơ là liên kết tới trang chi tiết. */
  readonly basePath?: string;
  /** Hồ sơ chính thức: thêm STT và các cột đúng mẫu sổ (Figma "Vi bằng · Danh sách"). Mỗi hồ sơ lấy dòng sổ đầu tiên. */
  readonly book?: { readonly spec: DmsBookSpec; readonly byCase: ReadonlyMap<string, DmsBookRow> };
}) {
  const bookCols = book ? book.spec.columns.filter((c) => c.key !== 'stt') : [];
  if (rows.length === 0) {
    return (
      <div className="state" role="status">
        <h2>Chưa có hồ sơ</h2>
        <p>Không có hồ sơ nào trong mục này thuộc phạm vi quyền của bạn.</p>
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {book ? <th scope="col">{sttLabel}</th> : null}
            <th scope="col">Hồ sơ</th>
            {bookCols.map((c) => (
              <th key={c.key} scope="col" style={{ textTransform: 'none', letterSpacing: 0 }}>
                {shortHeading(c.heading)}
              </th>
            ))}
            <th scope="col">Ngày tạo</th>
            <th scope="col">Ghi sổ</th>
            <th scope="col">Tài liệu · Bản scan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const scan = scanState(r);
            return (
              <tr key={r.id}>
                {book ? (
                  <td className="font-semibold">{book.byCase.get(r.id)?.stt ?? '—'}</td>
                ) : null}
                <th scope="row">
                  {basePath ? <Link href={`${basePath}/${r.id}`}>{r.title}</Link> : r.title}
                </th>
                {bookCols.map((c) => {
                  const row = book!.byCase.get(r.id);
                  return <td key={c.key}>{row ? bookCell(book!.spec, c, row) : ''}</td>;
                })}
                <td>{fmt.format(new Date(r.created_at))}</td>
                <td>{r.recorded_at ? fmt.format(new Date(r.recorded_at)) : '—'}</td>
                <td>
                  <span className="chip" data-tone="info">
                    {r.document_count} tài liệu
                  </span>{' '}
                  <span className="chip" data-tone={scan === 'ok' ? 'ok' : 'danger'}>
                    {scan === 'no-documents'
                      ? 'Chưa có tài liệu'
                      : scan === 'missing'
                        ? 'Thiếu scan'
                        : `${r.scan_count} scan`}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
