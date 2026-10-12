'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';
import type { Branch } from '../app/session';

interface Props {
  readonly branches: readonly Branch[];
}

async function post(
  path: string,
  body: unknown,
): Promise<{ ok: boolean; code?: string; label?: string }> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { code?: string; label?: string };
  return { ok: res.ok, code: json.code, label: json.label };
}

/** Tạo khách rồi tạo hồ sơ (INTAKE). Mọi kiểm tra quyền do máy chủ làm; lỗi hiển thị nguyên nhân bằng tiếng Việt. */
export function NewCaseForm({ branches }: Props) {
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
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const customer = await post('/vibang/customers', {
        kind: String(f.get('kind')),
        externalRef: String(f.get('customerRef') ?? ''),
      });
      if (!customer.ok || !customer.label) return setError(messageFor(customer.code));
      const created = await post('/vibang/cases', {
        officeId: branch.officeId,
        branchId: branch.id,
        customerId: customer.label,
        title: String(f.get('title') ?? ''),
        description: String(f.get('description') ?? ''),
      });
      if (!created.ok) return setError(messageFor(created.code));
      form.reset();
      setDone(true);
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  if (branches.length === 0) {
    return <p className="muted">Bạn chưa có chi nhánh nào để tiếp nhận hồ sơ.</p>;
  }
  return (
    <form className="card form" onSubmit={submit} aria-labelledby="new-case-title">
      <h2 id="new-case-title">Tiếp nhận hồ sơ mới</h2>
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
        Loại khách
        <select name="kind" defaultValue="PERSON">
          <option value="PERSON">Cá nhân</option>
          <option value="ORGANIZATION">Tổ chức</option>
        </select>
      </label>
      <label>
        Mã tham chiếu khách hàng
        <input name="customerRef" required maxLength={200} />
      </label>
      <label>
        Tiêu đề hồ sơ
        <input name="title" required maxLength={300} />
      </label>
      <label>
        Nội dung cần ghi nhận
        <textarea name="description" rows={3} maxLength={5000} />
      </label>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
      <p role="status" className="success" hidden={!done}>
        Đã tiếp nhận hồ sơ.
      </p>
      <button type="submit" className="primary" disabled={busy}>
        {busy ? 'Đang lưu…' : 'Tiếp nhận hồ sơ'}
      </button>
    </form>
  );
}
