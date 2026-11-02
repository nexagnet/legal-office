'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { savedParamsToHref, type DmsSavedParams } from '../lib/dms-filter-params';
import { messageFor } from '../lib/messages';
import { Button } from './ui/button';
import { Input } from './ui/field';

interface Saved {
  readonly id: string;
  readonly name: string;
  readonly params: DmsSavedParams;
}

/**
 * Bộ lọc đã lưu của riêng từng người, theo miền: lưu cách lọc hiện tại với một tên, mở lại bằng một cú bấm.
 * Đây là tuỳ chọn giao diện, không phải hồ sơ nghiệp vụ, nên xoá được và không cần xác nhận.
 */
export function DmsSavedFilters({
  officeId,
  domain,
  basePath,
  current,
}: {
  readonly officeId: string;
  readonly domain: string;
  readonly basePath: string;
  readonly current: DmsSavedParams;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<readonly Saved[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/dms/saved-filters?officeId=${encodeURIComponent(officeId)}&domain=${encodeURIComponent(domain)}`,
      );
      if (!res.ok) throw new Error(String(res.status));
      setItems(((await res.json()) as { rows: Saved[] }).rows);
      setError(null);
    } catch {
      setError('Không tải được danh sách bộ lọc đã lưu.');
    }
  }, [officeId, domain]);

  useEffect(() => {
    if (open && items === null) void load();
  }, [open, items, load]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  async function call(method: string, url: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { code?: string };
        setError(
          json.code === 'INVALID_ITEM'
            ? 'Mỗi miền lưu tối đa 30 bộ lọc. Hãy xóa bớt một bộ lọc cũ.'
            : messageFor(json.code),
        );
        return false;
      }
      setError(null);
      return true;
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (
      await call('POST', '/api/dms/saved-filters', {
        officeId,
        domain,
        name: trimmed,
        params: current,
      })
    ) {
      setName('');
      await load();
    }
  }

  async function remove(id: string) {
    if (await call('DELETE', `/api/dms/saved-filters/${id}`)) await load();
  }

  return (
    <div ref={box} className="relative">
      <Button
        type="button"
        variant="secondary"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        Bộ lọc đã lưu{items && items.length > 0 ? ` (${items.length})` : ''}
      </Button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute left-0 z-20 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-line-strong bg-surface p-3 shadow-lg"
      >
        {error ? (
          <p role="alert" className="mb-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {items === null ? (
          <p className="muted text-sm">Đang tải…</p>
        ) : items.length === 0 ? (
          <p className="muted mb-2 text-sm">Chưa có bộ lọc nào được lưu.</p>
        ) : (
          <ul className="m-0 mb-3 grid max-h-60 list-none gap-1 overflow-auto p-0">
            {items.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <Link
                  href={savedParamsToHref(basePath, s.params)}
                  className="min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2"
                  onClick={() => setOpen(false)}
                >
                  {s.name}
                </Link>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Xóa bộ lọc ${s.name}`}
                  className="rounded-lg px-2 py-1 text-xs text-danger hover:bg-surface-2"
                  onClick={() => void remove(s.id)}
                >
                  Xóa
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* Không dùng <form>: khối này nằm trong biểu mẫu tìm kiếm, mà biểu mẫu lồng nhau là HTML sai (Lưu sẽ gửi cả biểu mẫu tìm). */}
        <div className="flex gap-2 border-t border-line pt-3">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Tên bộ lọc</span>
            <Input
              name="filter-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="Tên cho cách lọc hiện tại"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void save();
                }
              }}
            />
          </label>
          <Button type="button" disabled={busy} onClick={() => void save()}>
            Lưu
          </Button>
        </div>
      </div>
    </div>
  );
}
