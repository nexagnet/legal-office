'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { messageFor } from '../lib/messages';
import { useDialogClose } from './StageDialog';
import { Button } from './ui/button';

/** Admin sửa họ tên hiển thị của một thành viên (hiện ở avatar và tên trên mọi hồ sơ). */
export function MemberNameForm({
  userId,
  officeId,
  currentName,
}: {
  readonly userId: string;
  readonly officeId: string;
  readonly currentName: string;
}) {
  const router = useRouter();
  const close = useDialogClose();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fullName = String(new FormData(e.currentTarget).get('fullName') ?? '').trim();
    if (!fullName) return setError('Vui lòng nhập họ tên.');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/members/${userId}/name`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ officeId, fullName }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) {
        const message = messageFor(json.code);
        setError(message);
        toast.error(message, { duration: Infinity });
        return;
      }
      toast.success('Đã cập nhật họ tên');
      router.refresh();
      close?.();
    } catch {
      const message = 'Không kết nối được máy chủ. Vui lòng thử lại.';
      setError(message);
      toast.error(message, { duration: Infinity });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <label className="grid gap-1.5 text-[13px] font-semibold text-ink">
        Họ tên hiển thị
        <input
          name="fullName"
          required
          maxLength={200}
          defaultValue={currentName}
          className="min-h-11 rounded-[10px] border border-line-strong bg-surface px-3 text-sm font-normal"
        />
      </label>
      <p className="text-[13px] text-muted">
        Họ tên này hiện ở avatar và tên người xử lý, người tạo, người duyệt trên các hồ sơ.
      </p>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={() => close?.()}>
          Hủy
        </Button>
        <Button type="submit" loading={busy}>
          Lưu họ tên
        </Button>
      </div>
    </form>
  );
}
