import type { DmsCaseRow } from '../lib/dms';
import { scanState } from '../lib/dms';

const fmt = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });

/**
 * Bảng hồ sơ DMS: MỘT hàng là MỘT hồ sơ; số tài liệu và số tệp scan hiển thị tách bạch (Figma "DMS CANONICAL").
 * Nháp và nháp đã hủy không có STT và không vào xuất sổ, nên không hiện cột STT ở đây.
 */
export function DmsCaseTable({
  rows,
  caption,
}: {
  readonly rows: readonly DmsCaseRow[];
  readonly caption: string;
}) {
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
            <th scope="col">Hồ sơ</th>
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
                <th scope="row">{r.title}</th>
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
