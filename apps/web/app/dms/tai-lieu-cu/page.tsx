import Link from 'next/link';
import { ErrorRetry } from '../../../components/ErrorRetry';
import { LegacyOpenButton } from '../../../components/LegacyOpenButton';
import { DataTable } from '../../../components/ui/data-table';
import { loadMyDmsPermissions } from '../../../lib/dms';
import {
  LEGACY_PAGE_SIZE,
  legacyFolderOf,
  legacySizeLabel,
  loadLegacyFiles,
} from '../../../lib/dms-legacy';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

const fmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

/** Đường dẫn trang kèm tiền tố thư mục và số trang. */
const hrefOf = (prefix: string, page: number) => {
  const q = new URLSearchParams();
  if (prefix) q.set('prefix', prefix);
  if (page > 1) q.set('p', String(page));
  const s = q.toString();
  return s ? `/dms/tai-lieu-cu?${s}` : '/dms/tai-lieu-cu';
};

/**
 * Tài liệu cũ: danh sách tệp đã nạp từ kho cũ của khách bằng công cụ lo-import. Chỉ xem và tải; không sửa, không xóa.
 * Lọc theo tiền tố đường dẫn (thư mục). Cần quyền `dms.legacy.read`.
 */
export default async function LegacyDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ prefix?: string; p?: string }>;
}) {
  const sp = await searchParams;
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Tài liệu cũ</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  if (!officeId) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Tài liệu cũ</h1>
        <div className="state" role="status">
          <h2>Chưa gắn văn phòng</h2>
        </div>
      </section>
    );
  }
  const cookie = await requestCookie();
  const permissions = await loadMyDmsPermissions(cookie, officeId);
  if (!permissions.includes('dms.legacy.read')) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Tài liệu cũ</h1>
        <div className="state" role="status">
          <h2>Bạn chưa có quyền xem tài liệu cũ</h2>
          <p>Liên hệ Admin để được cấp quyền xem tài liệu cũ.</p>
        </div>
      </section>
    );
  }
  const prefix = (sp.prefix ?? '').trim().slice(0, 1000);
  const page = Math.max(1, Math.floor(Number(sp.p)) || 1);
  // Lấy dư một dòng để biết còn trang sau hay không (máy chủ không trả tổng số).
  const list = await loadLegacyFiles(cookie, {
    officeId,
    prefix,
    limit: LEGACY_PAGE_SIZE + 1,
    offset: (page - 1) * LEGACY_PAGE_SIZE,
  });
  if (list === 'error' || list === 404) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Tài liệu cũ</h1>
        <ErrorRetry
          title="Lỗi tải dữ liệu"
          message="Không tải được danh sách tài liệu cũ. Kiểm tra kết nối và thử lại."
        />
      </section>
    );
  }
  const hasMore = list.rows.length > LEGACY_PAGE_SIZE;
  const rows = list.rows.slice(0, LEGACY_PAGE_SIZE);
  return (
    <section aria-labelledby="t">
      <h1 id="t">Tài liệu cũ</h1>
      <p className="muted">
        Tài liệu được nạp từ kho cũ của văn phòng. Chỉ xem và tải, không sửa, không xóa. Mỗi lần mở
        tệp đều được ghi nhật ký.
      </p>
      <form method="get" role="search" className="toolbar">
        <label className="sr-only" htmlFor="legacy-prefix">
          Thư mục hoặc đường dẫn bắt đầu bằng
        </label>
        <input
          id="legacy-prefix"
          type="search"
          name="prefix"
          defaultValue={prefix}
          placeholder="Thư mục hoặc đường dẫn bắt đầu bằng… (vd. 2019/Hợp đồng/)"
          maxLength={1000}
          className="input"
        />
        <button type="submit" className="btn-link primary">
          Lọc
        </button>
        {prefix ? <Link href="/dms/tai-lieu-cu">Bỏ lọc</Link> : null}
      </form>
      {rows.length === 0 ? (
        <div className="state" role="status">
          <h2>{prefix ? 'Không có tệp nào khớp thư mục này' : 'Chưa có tài liệu cũ nào'}</h2>
          <p>
            {prefix
              ? 'Kiểm tra lại đường dẫn hoặc bỏ lọc để xem tất cả.'
              : 'Tài liệu cũ sẽ hiện ở đây sau khi được nạp bằng công cụ lo-import.'}
          </p>
        </div>
      ) : (
        <DataTable tableKey="dms-tai-lieu-cu">
          <table>
            <caption className="sr-only">Danh sách tài liệu cũ</caption>
            <thead>
              <tr>
                <th scope="col">Tệp</th>
                <th scope="col">Thư mục</th>
                <th scope="col">Dung lượng</th>
                <th scope="col">Ngày sửa gốc</th>
                <th scope="col">Ngày nạp</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const folder = legacyFolderOf(r.rel_path);
                return (
                  <tr key={r.id}>
                    <th scope="row">{r.file_name}</th>
                    <td>
                      {folder ? (
                        <Link href={hrefOf(`${folder}/`, 1)}>{folder}</Link>
                      ) : (
                        <span className="muted">Gốc</span>
                      )}
                    </td>
                    <td>{legacySizeLabel(r.size_bytes)}</td>
                    <td>{r.source_mtime ? fmt.format(new Date(r.source_mtime)) : '—'}</td>
                    <td>{fmt.format(new Date(r.created_at))}</td>
                    <td>
                      <LegacyOpenButton id={r.id} name={r.file_name} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DataTable>
      )}
      <div className="dms-foot">
        <p>
          Trang {page} · {rows.length} tệp
        </p>
        {page > 1 || hasMore ? (
          <nav aria-label="Phân trang" className="dms-pager">
            {page > 1 ? (
              <Link href={hrefOf(prefix, page - 1)} rel="prev" aria-label="Trang trước">
                ‹
              </Link>
            ) : null}
            <span aria-current="page">{page}</span>
            {hasMore ? (
              <Link href={hrefOf(prefix, page + 1)} rel="next" aria-label="Trang sau">
                ›
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
    </section>
  );
}
