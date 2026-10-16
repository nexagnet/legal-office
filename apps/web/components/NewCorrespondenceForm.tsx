'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { CORRESPONDENCE_DIRECTION_LABEL, messageFor } from '../lib/messages';
import type { Branch } from '../app/session';
import { CheckPanel } from './CheckPanel';

/** Vào sổ một công văn đến (cần ngày nhận) hoặc mở bản nháp công văn đi. Quyền do máy chủ kiểm. */
export function NewCorrespondenceForm({ branches }: { readonly branches: readonly Branch[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [direction, setDirection] = useState('INBOUND');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const branch = branches.find((b) => b.id === f.get('branchId'));
    if (!branch) return setError('Chọn chi nhánh.');
    const refNo = String(f.get('refNo') ?? '').trim();
    const receivedOn = String(f.get('receivedOn') ?? '');
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch('/api/office/correspondence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          officeId: branch.officeId,
          branchId: branch.id,
          direction,
          docType: String(f.get('docType') ?? ''),
          counterparty: String(f.get('counterparty') ?? ''),
          subject: String(f.get('subject') ?? ''),
          ...(direction === 'INBOUND' && refNo ? { refNo } : {}),
          ...(direction === 'INBOUND' && receivedOn ? { receivedOn } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setError(messageFor(json.code));
      form.reset();
      setDone(true);
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  if (branches.length === 0) return <p className="muted">Bạn chưa có chi nhánh nào để vào sổ.</p>;
  return (
    <form className="panels assign-grid" onSubmit={submit} aria-labelledby="new-corr-t">
      <section className="panel form">
        <h2 id="new-corr-t">Thông tin văn bản</h2>
        <label>
          Loại
          <select name="direction" value={direction} onChange={(e) => setDirection(e.target.value)}>
            {Object.entries(CORRESPONDENCE_DIRECTION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Chi nhánh
          <select name="branchId" required defaultValue={branches[0]?.id}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Loại văn bản
          <input name="docType" required maxLength={200} />
        </label>
        <label>
          {direction === 'INBOUND' ? 'Nơi gửi' : 'Nơi nhận'}
          <input name="counterparty" required maxLength={300} />
        </label>
        <label>
          Trích yếu
          <input name="subject" required maxLength={1000} />
        </label>
        {direction === 'INBOUND' ? (
          <>
            <label>
              Số, ký hiệu của nơi gửi
              <input name="refNo" maxLength={200} />
            </label>
            <label>
              Ngày nhận
              <input name="receivedOn" type="date" required />
            </label>
          </>
        ) : (
          <p className="muted">Số và ngày ban hành do Văn phòng ghi khi ban hành.</p>
        )}
      </section>
      <CheckPanel
        notice="Hệ thống kiểm tra điều kiện và quyền trước khi cho phép thao tác."
        note="Lưu dấu thời gian • người thực hiện • bằng chứng • trạng thái."
        title="Nguyên tắc sổ văn thư"
        checks={[
          'Có số thứ tự và ngày ghi sổ',
          'Có tài liệu scan và người xử lý',
          'Cho phép tìm kiếm theo năm',
          'Ghi vết chuyển xử lý / kết thúc',
          'Mẫu TT06 chỉ ở thư viện để tải',
        ]}
      >
        <p role="alert" className="error" hidden={!error}>
          {error}
        </p>
        <p role="status" className="success" hidden={!done}>
          Đã vào sổ.
        </p>
        <button type="submit" className="primary wide" disabled={busy}>
          {busy ? 'Đang lưu…' : 'Vào sổ'}
        </button>
      </CheckPanel>
    </form>
  );
}
