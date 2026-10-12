'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';
import type { Branch } from '../app/session';

async function post(path: string, body: unknown) {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { code?: string; label?: string };
  return { ok: res.ok, code: json.code, label: json.label };
}

/** Tạo yêu cầu tống đạt rồi thêm văn bản đầu tiên. Quyền do máy chủ kiểm. */
export function NewServiceForm({ branches }: { readonly branches: readonly Branch[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const branch = branches.find((b) => b.id === f.get('branchId'));
    if (!branch) return setError('Chọn chi nhánh.');
    const deadline = String(f.get('deadline') ?? '');
    if (!deadline) return setError(messageFor('DEADLINE_REQUIRED'));
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const req = await post('/service-of-documents/requests', {
        officeId: branch.officeId,
        branchId: branch.id,
        requestRef: String(f.get('requestRef') ?? ''),
      });
      if (!req.ok || !req.label) return setError(messageFor(req.code));
      const doc = await post(`/service-of-documents/requests/${req.label}/documents`, {
        recipientName: String(f.get('recipientName') ?? ''),
        address: String(f.get('address') ?? ''),
        deadlineAt: new Date(deadline).toISOString(),
      });
      if (!doc.ok) return setError(messageFor(doc.code));
      form.reset();
      setDone(true);
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  if (branches.length === 0)
    return <p className="muted">Bạn chưa có chi nhánh nào để tạo yêu cầu.</p>;
  return (
    <form className="card form" onSubmit={submit} aria-labelledby="new-service-t">
      <h2 id="new-service-t">Tạo yêu cầu tống đạt</h2>
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
        Mã yêu cầu
        <input name="requestRef" required maxLength={200} />
      </label>
      <label>
        Người nhận
        <input name="recipientName" required maxLength={300} />
      </label>
      <label>
        Địa chỉ
        <input name="address" required maxLength={500} />
      </label>
      <label>
        Hạn tống đạt
        <input name="deadline" type="datetime-local" required />
      </label>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
      <p role="status" className="success" hidden={!done}>
        Đã tạo yêu cầu và văn bản.
      </p>
      <button type="submit" className="primary" disabled={busy}>
        {busy ? 'Đang lưu…' : 'Tạo yêu cầu'}
      </button>
    </form>
  );
}
