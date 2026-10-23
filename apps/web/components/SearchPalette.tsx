'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { NavItem } from '../app/nav';
import { searchEntries, type SearchCase } from '../lib/search-entries';

/** Ô tìm kiếm trên đầu trang: tìm trang và hồ sơ Vi bằng bạn được xem. Mở bằng bấm hoặc Ctrl/⌘+K. */
export function SearchPalette({ items }: { readonly items: readonly NavItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cases, setCases] = useState<readonly SearchCase[] | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open || cases !== null) return;
    let live = true;
    fetch('/api/vibang/cases?limit=100')
      .then((r) => (r.ok ? (r.json() as Promise<{ items: SearchCase[] }>) : { items: [] }))
      .then((b) => live && setCases(b.items))
      .catch(() => live && setCases([]));
    return () => {
      live = false;
    };
  }, [open, cases]);

  const hits = useMemo(() => searchEntries(query, items, cases ?? []), [query, items, cases]);

  const go = (href: string) => {
    setOpen(false);
    setQuery('');
    router.push(href);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="search-trigger" aria-label="Tìm kiếm">
        <Search aria-hidden="true" />
        <span>Tìm kiếm hồ sơ, trang…</span>
        <kbd>Ctrl K</kbd>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="search-overlay" />
        <Dialog.Content className="search-panel" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Tìm kiếm</Dialog.Title>
          <input
            autoFocus
            type="search"
            className="search-input"
            placeholder="Gõ tên trang, hồ sơ hoặc khách hàng"
            aria-label="Từ khóa tìm kiếm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && hits[0]) go(hits[0].href);
            }}
          />
          <ul className="search-results" aria-label="Kết quả">
            {hits.map((h) => (
              <li key={`${h.kind}-${h.href}`}>
                <button type="button" onClick={() => go(h.href)}>
                  <strong>{h.label}</strong>
                  <small>{h.hint}</small>
                </button>
              </li>
            ))}
          </ul>
          {query.trim() && hits.length === 0 ? (
            <p className="search-empty">
              {cases === null ? 'Đang tìm…' : 'Không có kết quả phù hợp.'}
            </p>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
