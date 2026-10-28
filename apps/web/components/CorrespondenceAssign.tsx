'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFor } from '../lib/messages';
import { postJson } from '../lib/post-json';
import { Button } from './ui/button';
import { Select } from './ui/field';
import type { HandlerOption } from './AssignHandler';

/** Giao hoặc đổi người xử lý công văn đến khi chưa xử lý (Admin, Trưởng VP, Thư ký; DB kiểm quyền). */
export function CorrespondenceAssign({
  id,
  options,
  currentId,
}: {
  readonly id: string;
  readonly options: readonly HandlerOption[];
  readonly currentId: string | null;
}) {
  const router = useRouter();
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choices = options.filter((o) => o.userId !== currentId);
  if (choices.length === 0) return null;

  async function assign() {
    if (!pick) return setError('Chọn người xử lý.');
    setBusy(true);
    setError(null);
    try {
      const r = await postJson(`/office/correspondence/${id}/assign`, { handlerUserId: pick });
      if (!r.ok) return setError(messageFor(r.code));
      setPick('');
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <label className="grid gap-1.5 text-[13px] font-semibold">
        {currentId ? 'Đổi người xử lý' : 'Giao người xử lý'}
        <Select value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Chọn người</option>
          {choices.map((o) => (
            <option key={o.userId} value={o.userId}>
              {o.label}
            </option>
          ))}
        </Select>
      </label>
      <Button variant="secondary" loading={busy} onClick={() => void assign()}>
        {currentId ? 'Đổi người xử lý' : 'Giao xử lý'}
      </Button>
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
