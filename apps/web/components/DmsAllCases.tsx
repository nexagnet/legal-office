import Link from 'next/link';
import { DataTable } from './ui/data-table';
import { DMS_DOMAINS, VAN_THU_DOMAINS } from '../lib/dms';
import type { DmsSearchCase } from '../lib/dms-browse';

const ALL_DOMAINS = [...DMS_DOMAINS, ...VAN_THU_DOMAINS];
const STATUS: Record<string, string> = {
  DRAFT: 'Nháp',
  RECORDED: 'Đã ghi sổ',
  CANCELLED: 'Đã hủy',
};
const TONE: Record<string, string> = { DRAFT: 'warn', RECORDED: 'ok', CANCELLED: 'danger' };
const fmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

export const ALL_CASES_PAGE_SIZE = 20;

/**
 * Bảng hồ sơ xuyên mọi nghiệp vụ (trang "Hồ sơ do tôi tạo" và "Mọi hồ sơ của văn phòng"). Chỉ hiển thị những gì DB
 * đã cho phép xem; phân trang bằng liên kết `?p=`.
 */
export function DmsAllCases({
  rows,
  total,
  page,
  basePath,
  emptyText,
}: {
  readonly rows: readonly DmsSearchCase[];
  readonly total: number | null;
  readonly page: number;
  readonly basePath: string;
  readonly emptyText: string;
}) {
  const pages = Math.max(1, Math.ceil((total ?? rows.length) / ALL_CASES_PAGE_SIZE));
  const href = (n: number) => (n <= 1 ? basePath : `${basePath}?p=${n}`);
  if (rows.length === 0) return <p className="muted">{emptyText}</p>;
  return (
    <>
      <DataTable tableKey={`dms-all-${basePath}`}>
        <table>
          <caption className="sr-only">Danh sách hồ sơ</caption>
          <thead>
            <tr>
              <th scope="col">Hồ sơ</th>
              <th scope="col">Nghiệp vụ</th>
              <th scope="col">Trạng thái</th>
              <th scope="col">Người tạo</th>
              <th scope="col">Ngày tạo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = ALL_DOMAINS.find((x) => x.code === r.domain);
              return (
                <tr key={r.id}>
                  <td>
                    {d ? (
                      <Link href={`/dms/${d.slug}/${r.id}`}>{r.case_number ?? r.title}</Link>
                    ) : (
                      (r.case_number ?? r.title)
                    )}
                    {r.case_number ? <div className="muted text-xs">{r.title}</div> : null}
                  </td>
                  <td>{d?.label ?? r.domain}</td>
                  <td>
                    <span className="chip" data-tone={TONE[r.status] ?? 'info'}>
                      {STATUS[r.status] ?? r.status}
                    </span>
                  </td>
                  <td>{r.creator_name ?? '—'}</td>
                  <td>{fmt.format(new Date(r.created_at))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </DataTable>
      {pages > 1 ? (
        <nav aria-label="Phân trang" className="mt-3 flex items-center gap-3 text-sm">
          {page > 1 ? <Link href={href(page - 1)}>← Trang trước</Link> : null}
          <span className="muted">
            Trang {page} / {pages}
          </span>
          {page < pages ? <Link href={href(page + 1)}>Trang sau →</Link> : null}
        </nav>
      ) : null}
    </>
  );
}
