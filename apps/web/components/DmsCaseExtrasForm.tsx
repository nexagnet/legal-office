'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/field';
import { messageFor } from '../lib/messages';

/**
 * Mục C của bản nháp: thông tin KHÔNG vào sổ (Tên hồ sơ, SĐT khách hàng, Ghi chú). Giữ nguyên mọi thuộc tính khác (các
 * cột sổ ở mục A), chỉ ghi đè `so_dien_thoai` và `note`. Tên để trống thì giữ tên đang có.
 */
export function DmsCaseExtrasForm({
  caseId,
  title,
  current,
  withPhone,
}: {
  readonly caseId: string;
  readonly title: string;
  readonly current: Record<string, unknown>;
  readonly withPhone: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const val = (k: string) => String(f.get(k) ?? '').trim();
    const attributes: Record<string, unknown> = { ...current, note: val('note') };
    if (withPhone) attributes.so_dien_thoai = val('phone');
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/dms/cases/${caseId}/draft`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: val('title') || title, attributes }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok)
        return setError(
          res.status === 400 && !json.code
            ? 'Thông tin chưa hợp lệ, kiểm tra lại số điện thoại.'
            : messageFor(json.code),
        );
      setSaved(true);
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label="Thông tin khác — không vào sổ" className="mb-4">
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-[13px] font-semibold sm:col-span-2">
          Tên hồ sơ
          <Input name="title" defaultValue={title} maxLength={500} />
        </label>
        {withPhone ? (
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            SĐT khách hàng
            <Input
              name="phone"
              type="tel"
              inputMode="tel"
              maxLength={20}
              defaultValue={String(current.so_dien_thoai ?? '')}
              pattern="\+?[0-9 .\(\)\-]{8,20}"
              title="Số điện thoại 8-15 chữ số, có thể có dấu cách, chấm, gạch, ngoặc hoặc +84"
            />
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-[13px] font-semibold sm:col-span-2 lg:col-span-4">
          Ghi chú
          <Input name="note" defaultValue={String(current.note ?? '')} maxLength={1000} />
        </label>
      </div>
      <p className="mt-3 flex items-center gap-3">
        <Button type="submit" variant="secondary" loading={busy}>
          Lưu nháp
        </Button>
        {saved ? <span role="status"> Đã lưu nháp.</span> : null}
      </p>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
