'use client';

import type { FormEvent } from 'react';
import { CheckPanel } from './CheckPanel';
import { useCasePost } from './CasePost';

export interface N11Item {
  readonly id: string;
  readonly reason: string;
  readonly requestedAt: string;
  readonly applied: boolean;
  readonly appliedAt: string | null;
}

export interface DocOption {
  readonly id: string;
  readonly label: string;
}

const CHECKS = [
  'Không thay đổi sự kiện / hành vi đã chứng kiến',
  'Không ghi đè Vi bằng đã phát hành',
  'Có chữ ký THV hoặc Trưởng VP',
  'Có dấu Văn phòng trên văn bản sửa',
  'Cập nhật CSDL và gửi khách trong 2 ngày làm việc',
];

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—');

interface Props {
  readonly caseId: string;
  readonly numberLabel: string | null;
  readonly caseTitle: string;
  readonly createdAt: string;
  readonly items: readonly N11Item[];
  readonly documents: readonly DocOption[];
}

/** Sửa lỗi kỹ thuật Vi bằng theo N-11 (Figma 19:64): đề nghị, rồi áp dụng bằng văn bản N-11 đã ký và đóng dấu. */
export function N11Correction(p: Props) {
  const { post, error, busy } = useCasePost();

  async function propose(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const reason = String(new FormData(form).get('reason') ?? '').trim();
    if (await post(`cases/${p.caseId}/n11-corrections`, { reason })) form.reset();
  }

  async function apply(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const documentId = String(new FormData(e.currentTarget).get('documentId') ?? '');
    await post(`n11-corrections/${id}/applications`, { documentId });
  }

  return (
    <div className="panels assign-grid">
      <section className="panel form">
        <h2>Lập văn bản sửa lỗi kỹ thuật</h2>
        <label>
          Số / ngày Vi bằng gốc
          <input value={`${p.numberLabel ?? p.caseTitle} · ${fmt(p.createdAt)}`} readOnly />
        </label>
        <form id="de-nghi-n11" className="form" onSubmit={propose}>
          <label>
            Lý do sửa
            <textarea name="reason" required minLength={5} maxLength={2000} rows={3} />
          </label>
        </form>
        <h3>Các đề nghị sửa lỗi</h3>
        {p.items.length === 0 ? <p className="muted">Chưa có đề nghị sửa lỗi N-11.</p> : null}
        {p.items.map((r) => (
          <form key={r.id} className="form" onSubmit={(e) => void apply(e, r.id)}>
            <p>
              {fmt(r.requestedAt)} · {r.reason} ·{' '}
              <strong>{r.applied ? `Đã áp dụng ${fmt(r.appliedAt)}` : 'Chưa áp dụng'}</strong>
            </p>
            {!r.applied && p.documents.length > 0 ? (
              <label>
                Văn bản N-11 đã ký và đóng dấu
                <select name="documentId" required>
                  {p.documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {!r.applied ? (
              <button type="submit" disabled={busy || p.documents.length === 0}>
                Áp dụng văn bản N-11
              </button>
            ) : null}
          </form>
        ))}
      </section>
      <CheckPanel
        title="Điều kiện pháp lý"
        notice="Hệ thống kiểm tra điều kiện và quyền trước khi cho phép thao tác."
        note="Lưu dấu thời gian • người thực hiện • bằng chứng • trạng thái."
        checks={CHECKS}
      >
        <p role="alert" className="error" hidden={!error}>
          {error}
        </p>
        <button
          type="submit"
          form="de-nghi-n11"
          className="primary wide"
          disabled={busy}
          aria-busy={busy}
        >
          Tạo dự thảo N-11
        </button>
      </CheckPanel>
    </div>
  );
}
