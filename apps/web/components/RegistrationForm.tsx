'use client';

import { useState, type FormEvent } from 'react';
import { REG_REASON_LABEL, REG_STATUS_LABEL, fmtDateTime } from '../lib/registration';
import { CheckPanel } from './CheckPanel';
import { useCasePost } from './CasePost';

interface Props {
  readonly caseId: string;
  readonly numberLabel: string;
  readonly madeAt: string | null;
  readonly regStatus: string;
  readonly deadlineAt: string | null;
}

const CHECKS = [
  'Không tự chặn bàn giao khách vì chưa cập nhật Sở',
  'Ghi người phụ trách và bằng chứng cập nhật',
  'Có kênh ghi nhận gửi Sở thay thế',
  'Nhắc việc trước/sau hạn',
  'S-03 là sổ theo dõi do Sở quản lý',
];

/** datetime-local nhận chuỗi giờ địa phương `YYYY-MM-DDTHH:mm`. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Cập nhật CSDL và Sở (Figma 19:188): ghi nhận trạng thái cập nhật và hạn; sự cố phải kèm mã lý do. */
export function RegistrationForm(p: Props) {
  const { post, error, busy } = useCasePost();
  const [status, setStatus] = useState(p.regStatus === 'NOT_STARTED' ? 'PENDING' : p.regStatus);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const deadline = String(f.get('deadlineAt') ?? '');
    if (!deadline) return;
    await post(
      `cases/${p.caseId}/registration`,
      {
        status,
        deadlineAt: new Date(deadline).toISOString(),
        ...(status === 'FAILED' ? { reasonCode: String(f.get('reasonCode')) } : {}),
      },
      'PUT',
    );
  }

  return (
    <form className="panels assign-grid" onSubmit={submit}>
      <section className="panel form">
        <h2>Hồ sơ cần cập nhật</h2>
        <label>
          Vi bằng
          <input value={p.numberLabel} readOnly />
        </label>
        <label>
          Thời điểm kết thúc lập
          <input value={fmtDateTime(p.madeAt)} readOnly />
        </label>
        <label>
          Thời hạn
          <input
            name="deadlineAt"
            type="datetime-local"
            required
            defaultValue={toLocalInput(p.deadlineAt)}
          />
        </label>
        <label>
          Tình trạng thực tế
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(REG_STATUS_LABEL)
              .filter(([k]) => k !== 'NOT_STARTED')
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </select>
        </label>
        {status === 'FAILED' ? (
          <label>
            Nếu không thể cập nhật
            <select name="reasonCode" required defaultValue="SO_REJECTED">
              {Object.entries(REG_REASON_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </section>
      <CheckPanel
        title="Cảnh báo hạn và sự cố"
        notice="Hệ thống kiểm tra điều kiện và quyền trước khi cho phép thao tác."
        note="Lưu dấu thời gian • người thực hiện • bằng chứng • trạng thái."
        checks={CHECKS}
      >
        <p role="alert" className="error" hidden={!error}>
          {error}
        </p>
        <button type="submit" className="primary wide" disabled={busy} aria-busy={busy}>
          Ghi nhận kết quả cập nhật
        </button>
      </CheckPanel>
    </form>
  );
}
