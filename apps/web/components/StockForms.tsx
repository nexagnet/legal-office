'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';
import type { Branch } from '../app/session';

/** Gửi một lệnh JSON, báo lỗi bằng tiếng Việt, làm mới trang khi xong. Quyền do máy chủ kiểm. */
function useCommand() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function send(path: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) {
        setError(messageFor(json.code));
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { send, error, busy };
}

const Alert = ({ error }: { error: string | null }) => (
  <p role="alert" className="error" hidden={!error}>
    {error}
  </p>
);

export function NewItemForm({ officeId }: { readonly officeId: string }) {
  const { send, error, busy } = useCommand();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const ok = await send('office/items', {
      officeId,
      name: String(f.get('name') ?? '').trim(),
      unit: String(f.get('unit') ?? '').trim(),
    });
    if (ok) form.reset();
  }
  return (
    <form className="card form" onSubmit={submit} aria-labelledby="new-item-t">
      <h2 id="new-item-t">Thêm vật tư</h2>
      <label>
        Tên vật tư
        <input name="name" required maxLength={300} />
      </label>
      <label>
        Đơn vị tính
        <input name="unit" required maxLength={50} />
      </label>
      <Alert error={error} />
      <button type="submit" className="primary" disabled={busy}>
        Thêm
      </button>
    </form>
  );
}

interface MovementProps {
  readonly items: readonly { itemId: string; name: string }[];
  readonly branches: readonly Branch[];
}

/** Nhập một lô (số phiếu nhập) hoặc xuất theo FIFO (mục đích). */
export function StockMovementForm({ items, branches }: MovementProps) {
  const { send, error, busy } = useCommand();
  const [kind, setKind] = useState<'receipts' | 'issues'>('receipts');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const text = String(f.get('text') ?? '').trim();
    const ok = await send(`office/items/${String(f.get('itemId'))}/${kind}`, {
      branchId: String(f.get('branchId')),
      quantity: Number(f.get('quantity')),
      ...(kind === 'receipts' ? { receiptRef: text } : { purpose: text }),
    });
    if (ok) form.reset();
  }
  if (items.length === 0 || branches.length === 0) return null;
  return (
    <form className="card form" onSubmit={submit} aria-labelledby="move-t">
      <h2 id="move-t">Nhập, xuất vật tư</h2>
      <label>
        Thao tác
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="receipts">Nhập kho</option>
          <option value="issues">Xuất kho</option>
        </select>
      </label>
      <label>
        Vật tư
        <select name="itemId" required>
          {items.map((i) => (
            <option key={i.itemId} value={i.itemId}>
              {i.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Chi nhánh
        <select name="branchId" required>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Số lượng
        <input name="quantity" type="number" min={1} step={1} required />
      </label>
      <label>
        {kind === 'receipts' ? 'Số phiếu nhập' : 'Mục đích xuất'}
        <input name="text" required maxLength={kind === 'receipts' ? 200 : 500} />
      </label>
      <Alert error={error} />
      <button type="submit" className="primary" disabled={busy}>
        {kind === 'receipts' ? 'Nhập kho' : 'Xuất kho'}
      </button>
    </form>
  );
}

/** Kiểm kê: đặt lại số còn của một lô, bắt buộc có lý do (Admin/Trưởng VP). */
export function AdjustBatchForm({
  batchId,
  remaining,
  received,
}: {
  readonly batchId: string;
  readonly remaining: number;
  readonly received: number;
}) {
  const { send, error, busy } = useCommand();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await send(`office/batches/${batchId}/adjustment`, {
      newRemaining: Number(f.get('newRemaining')),
      reason: String(f.get('reason') ?? '').trim(),
    });
  }
  return (
    <form className="form" onSubmit={submit}>
      <label>
        Số còn lại mới
        <input
          name="newRemaining"
          type="number"
          min={0}
          max={received}
          step={1}
          defaultValue={remaining}
          required
        />
      </label>
      <label>
        Lý do
        <input name="reason" required maxLength={500} />
      </label>
      <Alert error={error} />
      <button type="submit" disabled={busy}>
        Kiểm kê
      </button>
    </form>
  );
}
