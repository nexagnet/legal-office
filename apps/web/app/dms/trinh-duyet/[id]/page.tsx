import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DeleteScanButton } from '../../../../components/DeleteScanButton';
import { ErrorRetry } from '../../../../components/ErrorRetry';
import { AddSubmissionFiles, DecideSubmission } from '../../../../components/SubmissionActions';
import { DataTable } from '../../../../components/ui/data-table';
import { loadMyDmsPermissions } from '../../../../lib/dms';
import { SUBMISSION_STATUS_LABEL, loadSubmission } from '../../../../lib/dms-submissions';
import { loadPeopleNames } from '../../../../lib/people';
import { currentSession, requestCookie } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

const fmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});
const TONE = { PENDING: 'warn', APPROVED: 'ok', REJECTED: 'danger' } as const;
const sizeLabel = (n: number | string) => `${Math.max(1, Math.round(Number(n) / 1024))} KB`;

/** Chi tiết một bản trình: nội dung, các bản scan (xem, tải, xóa scan nếu có quyền) và khung Admin duyệt. */
export default async function SubmissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ file?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Trình / Duyệt</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem bản trình.
          </p>
        </div>
      </section>
    );
  }
  const cookie = await requestCookie();
  const s = await loadSubmission(cookie, id);
  if (s === 404) notFound();
  if (s === 'error') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Trình / Duyệt</h1>
        <ErrorRetry
          title="Lỗi tải dữ liệu"
          message="Không tải được bản trình. Kiểm tra kết nối và thử lại."
        />
      </section>
    );
  }
  const [permissions, names] = await Promise.all([
    loadMyDmsPermissions(cookie, s.office_id),
    loadPeopleNames(cookie, [s.submitted_by, s.decided_by]),
  ]);
  const isAdmin = permissions.includes('dms.permission.approve');
  const canDeleteScan = permissions.includes('dms.scan.delete');
  const preview = s.files.find((f) => f.id === sp.file) ?? s.files[0];
  const base = `/dms/trinh-duyet/${s.id}`;
  return (
    <section aria-labelledby="t">
      <p>
        <Link href="/dms/trinh-duyet">← Trình / Duyệt</Link>
      </p>
      <h1 id="t">{s.title}</h1>
      <p>
        <span className="chip" data-tone={TONE[s.status]}>
          {SUBMISSION_STATUS_LABEL[s.status]}
        </span>{' '}
        <span className="chip" data-tone="info">
          {s.files.length} scan
        </span>
      </p>
      <dl className="mb-4">
        <dt>Người gửi</dt>
        <dd>{names.get(s.submitted_by) ?? '—'}</dd>
        <dt>Ngày gửi</dt>
        <dd>{fmt.format(new Date(s.submitted_at))}</dd>
        {s.case_number || s.case_title ? (
          <>
            <dt>Hồ sơ liên quan</dt>
            <dd>
              {s.case_number ?? '—'}
              {s.case_title ? ` · ${s.case_title}` : ''}
            </dd>
          </>
        ) : null}
        <dt>Mô tả</dt>
        <dd>{s.description || '—'}</dd>
        {s.decided_at ? (
          <>
            <dt>{s.status === 'APPROVED' ? 'Duyệt bởi' : 'Từ chối bởi'}</dt>
            <dd>
              {s.decided_by ? (names.get(s.decided_by) ?? '—') : '—'} ·{' '}
              {fmt.format(new Date(s.decided_at))}
            </dd>
            {s.decision_note ? (
              <>
                <dt>Ghi chú</dt>
                <dd>{s.decision_note}</dd>
              </>
            ) : null}
          </>
        ) : null}
      </dl>

      {s.status === 'PENDING' && isAdmin ? <DecideSubmission submissionId={s.id} /> : null}

      <h2>Bản scan</h2>
      {s.files.length === 0 ? (
        <div className="state" role="status">
          <h3>Chưa có bản scan</h3>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <DataTable tableKey="dms-trinh-duyet-files">
            <table>
              <caption className="sr-only">Bản scan của bản trình</caption>
              <thead>
                <tr>
                  <th scope="col">Tệp</th>
                  <th scope="col">Dung lượng</th>
                  <th scope="col">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {s.files.map((f) => (
                  <tr key={f.id}>
                    <th scope="row">{f.label}</th>
                    <td>{sizeLabel(f.size_bytes)}</td>
                    <td>
                      <div className="file-actions">
                        <Link href={`${base}?file=${f.id}`}>Xem</Link>
                        <a href={`/api/dms/submission-files/${f.id}/download`} download>
                          Tải
                        </a>
                        {canDeleteScan ? (
                          <DeleteScanButton kind="submission" fileId={f.id} label={f.label} />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
          <aside aria-label="Xem trước tệp">
            {preview ? (
              <>
                <iframe
                  title={`Xem trước ${preview.label}`}
                  src={`/api/dms/submission-files/${preview.id}/download?inline=1`}
                  className="h-[560px] w-full rounded-2xl border border-line bg-surface"
                />
                <p className="muted mt-2">Xem trước · {preview.label}</p>
              </>
            ) : null}
          </aside>
        </div>
      )}

      {s.status === 'PENDING' ? (
        <div className="mt-4">
          <h2>Thêm bản scan</h2>
          <AddSubmissionFiles submissionId={s.id} />
        </div>
      ) : null}
      <p className="muted mt-4">
        Bản trình không bao giờ bị xóa. Chỉ file scan xóa được, với người có quyền xóa scan.
      </p>
    </section>
  );
}
