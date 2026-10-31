'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { DmsBookColumn } from '../lib/dms';
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

  return (
    <form onSubmit={submit} aria-label={legend} className="mb-4">
      <fieldset className="grid gap-2">
        <legend>{legend}</legend>
        {columns.map((c) => (
          <label key={c.key} className="flex flex-col gap-1 text-sm">
            <span>
              Cột {c.no}: {c.group ? `${c.group} · ` : ''}
              {c.heading}
            </span>
            <input
              name={c.key}
              defaultValue={String(current[c.key] ?? '')}
              maxLength={2000}
              placeholder={c.tick ? 'Gõ x nếu có' : undefined}
            />
          </label>
        ))}
      </fieldset>
      <button type="submit" disabled={busy}>
        Lưu nháp
      </button>
      {saved ? <span role="status"> Đã lưu nháp.</span> : null}
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
