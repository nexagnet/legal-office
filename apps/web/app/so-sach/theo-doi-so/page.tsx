import Link from 'next/link';
import { StatCard } from '../../../components/StatCard';
import { getJson } from '../../../lib/case-api';
import { REG_STATUS_LABEL, fmtDateTime, type Registration } from '../../../lib/registration';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

interface Result {
  readonly summary: { readonly pending: number; readonly done: number; readonly incident: number };
  readonly items: readonly Registration[];
}

const TABS = [
  { key: '', label: 'Tất cả' },
  { key: 'pending', label: 'Chờ cập nhật' },
  { key: 'done', label: 'Đã cập nhật' },
  { key: 'incident', label: 'Sự cố' },
] as const;

/** Theo dõi cập nhật CSDL / Sở Tư pháp (Figma 3:236): danh sách công việc phía Văn phòng, không phải sổ S-03 của Sở. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const status = (await searchParams).status ?? '';
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Theo dõi Sở / CSDL</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để theo dõi cập nhật CSDL và Sở.
          </p>
        </div>
      </section>
    );
  }
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await getJson<Result>(`/vibang/registrations${qs}`, await requestCookie());
  if (typeof res !== 'object') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">Theo dõi Sở / CSDL</h1>
        <div className="state" role="alert">
          <h2>Không tải được danh sách</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      </section>
    );
  }
  return (
    <section aria-labelledby="t">
      <div className="page-head">
        <div>
          <h1 id="t">Theo dõi cập nhật với Sở Tư pháp</h1>
        </div>
      </div>
      <div className="stats">
        <StatCard
          label="Chờ cập nhật"
          value={res.summary.pending}
          note="Theo dõi hạn 3 ngày làm việc"
          tone="amber"
        />
        <StatCard
          label="Đã cập nhật"
          value={res.summary.done}
          note="Có ngày và thông tin ghi nhận"
          tone="green"
        />
        <StatCard
          label="Cần xử lý sự cố"
          value={res.summary.incident}
          note="Theo dõi nguyên nhân và hướng giải quyết"
          tone="red"
        />
      </div>
      <p className="tabs-line">
        {TABS.map((t) => (
          <Link
            key={t.key}
            className="tab-chip"
            aria-current={status === t.key ? 'true' : undefined}
            href={t.key ? `/so-sach/theo-doi-so?status=${t.key}` : '/so-sach/theo-doi-so'}
          >
            {t.label}
          </Link>
        ))}
      </p>
      {res.items.length === 0 ? (
        <div className="state" role="status">
          <h2>Không có Vi bằng nào</h2>
          <p>Chưa có Vi bằng đã cấp số thuộc nhóm này.</p>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Số Vi bằng</th>
              <th>THV</th>
              <th>Ngày lập</th>
              <th>Trạng thái Sở</th>
              <th>Hạn</th>
              <th>Ghi chú</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {res.items.map((r) => (
              <tr key={r.caseId}>
                <td>
                  <strong>{r.numberLabel}</strong>
                </td>
                <td>{r.thvLabel ?? '—'}</td>
                <td>{fmtDateTime(r.madeAt)}</td>
                <td>{REG_STATUS_LABEL[r.regStatus] ?? r.regStatus}</td>
                <td>
                  {r.overdue ? `Quá hạn ${fmtDateTime(r.deadlineAt)}` : fmtDateTime(r.deadlineAt)}
                </td>
                <td>{r.incidentReason ?? '—'}</td>
                <td>
                  <Link href={`/vi-bang/${r.caseId}/cap-nhat-so`}>Ghi nhận</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="panel muted">
        Đã trả khách và trạng thái cập nhật Sở là hai luồng riêng. Sự cố cập nhật không tự xóa hoặc
        đảo trạng thái đã trả khách.
      </p>
      <p className="muted">
        Lưu ý: TP-THV-S-03 là mẫu sổ của Sở Tư pháp; đây chỉ là danh sách công việc phía Văn phòng.
      </p>
    </section>
  );
}
