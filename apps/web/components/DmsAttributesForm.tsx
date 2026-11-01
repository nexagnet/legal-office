'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { DmsBookColumn } from '../lib/dms';
import { Button } from './ui/button';
import { Input } from './ui/field';
import { messageFor } from '../lib/messages';

/**
 * Nhập các cột của sổ cho BẢN NHÁP (hồ sơ hoặc giấy tờ). `method`/`url`/`extra` do trang quyết định;
 * thuộc tính khác (vd ghi chú) được giữ nguyên, chỉ ghi đè các khoá của cột sổ. Máy chủ vẫn từ chối nếu đã ghi sổ.
 */
export function DmsAttributesForm({
  url,
  columns,
  current,
  fixed,
  legend,
}: {
  readonly url: string;
  readonly columns: readonly DmsBookColumn[];
  readonly current: Record<string, unknown>;
  /** Phần thân cố định của yêu cầu (vd title hoặc kind/title/isOfficial). */
  readonly fixed: Record<string, unknown>;
  readonly legend: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const attributes: Record<string, unknown> = { ...current };
    for (const c of columns) attributes[c.key] = String(f.get(c.key) ?? '').trim();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...fixed, attributes }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setError(messageFor(json.code));
      setSaved(true);
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  const isBook = /^(Nội dung|Giấy tờ) vào sổ/.test(legend);
  return (
    <form onSubmit={submit} aria-label={legend} className="mb-4">
      <fieldset className="grid gap-x-4 gap-y-3 border-0 p-0 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-2 font-serif text-lg font-bold">{legend}</legend>
        {columns.map((c) => (
          <label key={c.key} className="flex flex-col gap-1 text-[13px] font-semibold">
            <span>
              {isBook ? `Cột ${c.no}: ` : ''}
              {c.group ? `${c.group} · ` : ''}
              {c.heading}
            </span>
            <Input
              name={c.key}
              defaultValue={String(current[c.key] ?? '')}
              maxLength={2000}
              placeholder={c.tick ? 'Gõ x nếu có' : undefined}
            />
          </label>
        ))}
      </fieldset>
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
