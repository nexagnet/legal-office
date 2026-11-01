import { DataTable } from '../../../components/ui/data-table';
import Link from 'next/link';
import { DmsAmendmentReview } from '../../../components/DmsAmendments';
import { Button } from '../../../components/ui/button';
import {
  AMENDMENT_STATUS_LABEL,
  DMS_DOMAINS,
  VAN_THU_DOMAINS,
  loadDmsAmendments,
  loadDmsBooks,
  loadDmsCase,
  type DmsAmendmentRow,
} from '../../../lib/dms';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

const fmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

const TONE: Record<DmsAmendmentRow['status'], string> = {
  PENDING: 'bg-[#fdf0d5] text-[#8a5a00]',
  APPROVED: 'bg-[#d9f1e2] text-[#1b6b3a]',
  REJECTED: 'bg-[#fde3e0] text-[#a12a20]',
};

export default async function DmsAmendmentsPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Yêu cầu sửa đổi</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem yêu cầu sửa đổi.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  if (!officeId) {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Yêu cầu sửa đổi</h1>
        <div className="state" role="status">
          <h2>Chưa gắn văn phòng</h2>
        </div>
      </section>
    );
  }
  const cookie = await requestCookie();
  const rows = await loadDmsAmendments(cookie, officeId);
  // Tên hồ sơ và tên cột sổ để hiện "Địa chỉ nơi lập → ..." thay vì khóa kỹ thuật (Figma C2).
  const caseIds = rows === 'error' ? [] : [...new Set(rows.map((r) => r.case_id))];
  const [cases, books] = await Promise.all([
    Promise.all(caseIds.map((id) => loadDmsCase(cookie, id))),
    loadDmsBooks(cookie, true),
  ]);
  const caseById = new Map(
    caseIds.map((id, i) => {
      const c = cases[i];
      return [id, c === undefined || c === 'error' || c === 'not-found' ? null : c] as const;
    }),
  );
  const heading = new Map<string, string>(
    books === 'error'
      ? []
      : books.flatMap((b) => b.columns.map((c) => [c.key, c.heading] as const)),
  );
  const slugOf = (code: string) =>
    [...DMS_DOMAINS, ...VAN_THU_DOMAINS].find((d) => d.code === code);
  const describe = (a: DmsAmendmentRow) => {
    const parts: string[] = [];
    if (a.proposed.title) parts.push(`Tiêu đề → ${a.proposed.title}`);
    for (const [k, v] of Object.entries(a.proposed.attributes ?? {}))
      parts.push(`${heading.get(k)?.replace(/\s*\(.*?\)/g, '') ?? k} → ${String(v)}`);
    return parts.join('; ') || 'Phiên bản tệp mới';
  };
  return (
    <section aria-labelledby="t">
      <h1 id="t">Yêu cầu sửa đổi</h1>
      <p className="muted">
        Hồ sơ đã lưu chính thức không sửa trực tiếp. Mọi thay đổi cần lý do và bản scan văn bản sửa
        đổi. Admin gửi thì có hiệu lực ngay; người khác luôn chờ Admin duyệt, không có tự duyệt theo
        thời gian.
      </p>
      {rows === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tải được yêu cầu</h2>
        </div>
      ) : rows.length === 0 ? (
        <div className="state" role="status">
          <h2>Chưa có yêu cầu sửa đổi</h2>
        </div>
      ) : (
        <DataTable tableKey="dms-sua-doi-page-1">
          <table>
            <caption className="sr-only">Yêu cầu sửa đổi</caption>
            <thead>
              <tr>
                <th scope="col">Hồ sơ</th>
                <th scope="col">Nội dung đề nghị</th>
                <th scope="col">Ngày gửi · xử lý</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Căn cứ scan</th>
                <th scope="col">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const c = caseById.get(a.case_id);
                const d = c ? slugOf(c.domain) : undefined;
                return (
                  <tr key={a.id}>
                    <th scope="row">
                      {c && d ? <Link href={`/dms/${d.slug}/${c.id}`}>{c.title}</Link> : '—'}
                    </th>
                    <td>
                      {a.n11 ? '(N-11) ' : ''}
                      {describe(a)}
                      <br />
                      <span className="muted">Lý do: {a.reason}</span>
                    </td>
                    <td>
                      {fmt.format(new Date(a.requested_at))}
                      <br />
                      <span className="muted">
                        {a.reviewed_at ? fmt.format(new Date(a.reviewed_at)) : '—'}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONE[a.status]}`}
                      >
                        {AMENDMENT_STATUS_LABEL[a.status]}
                      </span>
                      {a.auto_via === 'WINDOW' ? ' (tự duyệt, quy tắc cũ đã bỏ)' : ''}
                    </td>
                    <td>
                      <Button asChild variant="secondary">
                        <a
                          className="no-underline"
                          href={`/api/dms/amendments/${a.id}/evidence`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Xem scan
                        </a>
                      </Button>
                    </td>
                    <td>
                      {a.status === 'PENDING' ? (
                        <DmsAmendmentReview requestId={a.id} />
                      ) : (
                        (a.review_note ?? '—')
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DataTable>
      )}
    </section>
  );
}
