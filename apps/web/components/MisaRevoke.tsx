'use client';

import type { FormEvent } from 'react';
import { CheckPanel } from './CheckPanel';
import { useCasePost } from './CasePost';

export interface RevokeProposal {
  readonly id: string;
  readonly reason: string;
  readonly proposedAt: string;
  readonly status: string;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Chờ Admin duyệt',
  ACCEPTED: 'Đã chấp thuận',
  REJECTED: 'Đã từ chối',
};

const CHECKS = [
  'Chặn trả khách nếu chưa bàn giao',
  'Giữ nguyên số và bản phát hành',
  'Không điều chỉnh thu/chi trên MISA',
  'Admin phê duyệt / từ chối có lịch sử',
  'Gỡ chặn sau khi MISA được xác nhận lại hợp lệ',
];

interface Props {
  readonly caseId: string;
  readonly caseTitle: string;
  readonly numberLabel: string | null;
  readonly misaStatusLabel: string;
  readonly reference: string | null;
  readonly confirmedAt: string | null;
  readonly proposals: readonly RevokeProposal[];
  readonly canPropose: boolean;
  readonly canDecide: boolean;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : '—');

/** Thu hồi xác nhận thanh toán trên MISA (Figma 19:2): kế toán đề nghị, Admin duyệt hoặc từ chối. */
export function MisaRevoke(p: Props) {
  const { post, error, busy } = useCasePost();
  const pending = p.proposals.find((r) => r.status === 'PENDING');

  async function propose(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const reason = String(new FormData(form).get('reason') ?? '').trim();
    if (await post(`cases/${p.caseId}/misa/revoke-proposals`, { reason })) form.reset();
  }

  return (
    <form id="thu-hoi-misa" className="panels assign-grid" onSubmit={propose}>
      <section className="panel form">
        <h2>Phiếu đề nghị thu hồi xác nhận</h2>
        <p className="stage-warn">
          Đề nghị này chặn trả khách cho đến khi Admin duyệt. Số và bản phát hành được giữ nguyên;
          không điều chỉnh thu/chi trên MISA.
        </p>
        <label>
          Hồ sơ đã cấp số
          <input value={p.numberLabel ?? p.caseTitle} readOnly />
        </label>
        <label>
          Trạng thái xác nhận MISA
          <input value={`${p.misaStatusLabel} · ${fmt(p.confirmedAt)}`} readOnly />
        </label>
        <label>
          Bằng chứng tham chiếu
          <input value={p.reference ?? 'Chưa có mã tham chiếu · không nhập số tiền'} readOnly />
        </label>
        <label>
          Lý do đề nghị thu hồi
          <textarea
            name="reason"
            required
            minLength={5}
            maxLength={2000}
            rows={3}
            disabled={!p.canPropose || !!pending}
          />
        </label>
        <h3>Lịch sử đề nghị</h3>
        {p.proposals.length === 0 ? (
          <p className="muted">Chưa có đề nghị thu hồi nào.</p>
        ) : (
          <ul className="check-list">
            {p.proposals.map((r) => (
              <li key={r.id}>
                {fmt(r.proposedAt)} · {STATUS_LABEL[r.status] ?? r.status} · {r.reason}
              </li>
            ))}
          </ul>
        )}
      </section>
      <CheckPanel
        title="Hậu quả và chặn thao tác"
        notice="Hệ thống kiểm tra điều kiện và quyền trước khi cho phép thao tác."
        note="Lưu dấu thời gian • người thực hiện • bằng chứng • trạng thái."
        checks={CHECKS}
      >
        <p role="alert" className="error" hidden={!error}>
          {error}
        </p>
        {pending && p.canDecide ? (
          <>
            <button
              type="button"
              className="primary wide"
              disabled={busy}
              aria-busy={busy}
              onClick={() => void post(`cases/${p.caseId}/misa/revoke-decisions`, { accept: true })}
            >
              Phê duyệt thu hồi
            </button>{' '}
            <button
              type="button"
              className="secondary wide"
              disabled={busy}
              aria-busy={busy}
              onClick={() =>
                void post(`cases/${p.caseId}/misa/revoke-decisions`, { accept: false })
              }
            >
              Từ chối
            </button>
          </>
        ) : (
          <button
            type="submit"
            className="primary wide"
            disabled={busy || !p.canPropose || !!pending}
          >
            Gửi yêu cầu → Admin duyệt
          </button>
        )}
        {pending && !p.canDecide ? <p className="muted">Đang chờ Admin duyệt.</p> : null}
      </CheckPanel>
    </form>
  );
}
