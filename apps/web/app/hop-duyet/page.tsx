import Link from 'next/link';
import { KpiStrip, countStatus } from '../../components/KpiStrip';
import { RowActions } from '../../components/RowActions';
import { StatusPill } from '../../components/StatusPill';
import { ApprovalActions } from '../../components/ApprovalActions';
import { API_URL, currentSession, requestCookie } from '../../lib/server';
import { APPROVAL_KIND_LABEL, APPROVAL_STATE_LABEL } from '../../lib/messages';

export const dynamic = 'force-dynamic';

interface Row {
  readonly kind: 'TRANSFER' | 'DELEGATION';
  readonly subjectId: string;
  readonly state: string;
  readonly lastReason: string | null;
  readonly createdAt: string;
}

const day = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });

async function load(cookie: string | null, officeId: string): Promise<Row[] | 'error'> {
  try {
    const res = await fetch(
      `${API_URL}/approvals/pending?officeId=${encodeURIComponent(officeId)}`,
      {
        headers: cookie ? { cookie } : {},
        cache: 'no-store',
      },
    );
    if (!res.ok) return 'error';
    return (await res.json()) as Row[];
  } catch {
    return 'error';
  }
}

export default async function ApprovalsPage() {
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Hộp duyệt</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem hộp duyệt.
          </p>
        </div>
      </section>
    );
  }
  const officeId = session.branches[0]?.officeId ?? session.memberships[0]?.officeId;
  const rows = officeId ? await load(await requestCookie(), officeId) : [];
  return (
    <section aria-labelledby="t">
      <h1 id="t">Hộp duyệt</h1>
      <p className="muted">
        Duyệt trong ứng dụng khác chữ ký pháp lý. Từ chối là chấm dứt đề xuất; trả lại thì chặn hoàn
        tất cho đến khi nộp lại.
      </p>
      {rows === 'error' ? (
        <div className="state" role="alert">
          <h2>Không tải được hộp duyệt</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="state" role="status">
          <h2>Không có đề xuất chờ</h2>
          <p>Chưa có đề xuất nào đang chờ trong phạm vi của bạn.</p>
        </div>
      ) : (
        <>
          <KpiStrip
            label="Tổng hợp đề xuất"
            items={[
              {
                label: 'Chờ duyệt',
                value: countStatus(
                  rows.map((r) => ({ status: r.state })),
                  'OPEN',
                ),
              },
              {
                label: 'Đã trả lại, chờ bổ sung',
                value: countStatus(
                  rows.map((r) => ({ status: r.state })),
                  'RETURNED',
                ),
                tone: 'warn',
              },
              {
                label: 'Đã từ chối',
                value: countStatus(
                  rows.map((r) => ({ status: r.state })),
                  'REJECTED',
                ),
                tone: 'danger',
              },
            ]}
          />
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Đề xuất chưa hoàn tất</caption>
              <thead>
                <tr>
                  <th scope="col">Loại</th>
                  <th scope="col">Trạng thái</th>
                  <th scope="col">Lý do gần nhất</th>
                  <th scope="col">Ngày đề xuất</th>
                  <th scope="col">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.kind}-${r.subjectId}`}>
                    <th scope="row">{APPROVAL_KIND_LABEL[r.kind] ?? r.kind}</th>
                    <td>
                      <StatusPill
                        status={r.state}
                        tone={r.state === 'REJECTED' ? 'danger' : 'warn'}
                        label={APPROVAL_STATE_LABEL[r.state] ?? r.state}
                      />
                    </td>
                    <td>{r.lastReason ?? <span className="muted">Chưa có</span>}</td>
                    <td>{day.format(new Date(r.createdAt))}</td>
                    <td>
                      <RowActions>
                        <ApprovalActions
                          kind={r.kind}
                          subjectId={r.subjectId}
                          state={r.state}
                          roles={session.roles}
                        />
                      </RowActions>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
