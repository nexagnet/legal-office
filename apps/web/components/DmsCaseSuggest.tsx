'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { Input } from './ui/field';

interface Suggestion {
  readonly id: string;
  readonly title: string;
  readonly creator_name: string | null;
  readonly branch_name: string | null;
  readonly document_count: number;
  readonly scan_count: number;
}

const DEBOUNCE_MS = 200;
const MIN_CHARS = 2;

/**
 * Ô tìm hồ sơ có gợi ý khi gõ: hỏi `/dms/case-search` (8 dòng, không đếm tổng) sau khi ngừng gõ 0,2 giây.
 * Chọn một gợi ý thì mở thẳng hồ sơ; bấm Enter khi chưa chọn thì gửi biểu mẫu tìm như cũ (không phụ thuộc JavaScript).
 */
export function DmsCaseSuggest({
  officeId,
  domain,
  basePath,
  status,
  year,
  defaultValue,
}: {
  readonly officeId: string;
  readonly domain: string;
  readonly basePath: string;
  readonly status: 'RECORDED' | 'DRAFT' | 'CANCELLED';
  readonly year?: number;
  readonly defaultValue: string;
}) {
  const router = useRouter();
  const listId = useId();
  const [value, setValue] = useState(defaultValue);
  const [items, setItems] = useState<readonly Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const seq = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const text = value.trim();
    if (text.length < MIN_CHARS || !open) {
      setItems([]);
      return;
    }
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      const q = new URLSearchParams({
        officeId,
        domain,
        status,
        q: text,
        limit: '8',
        total: 'false',
      });
      if (year !== undefined) q.set('year', String(year));
      try {
        const res = await fetch(`/api/dms/case-search?${q}`);
        if (!res.ok || mine !== seq.current) return;
        const body = (await res.json()) as { rows: Suggestion[] };
        if (mine === seq.current) {
          setItems(body.rows);
          setActive(-1);
        }
      } catch {
        if (mine === seq.current) setItems([]); // gợi ý chỉ là tiện ích: lỗi thì thôi, vẫn bấm Tìm được
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, open, officeId, domain, status, year]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const show = open && items.length > 0;
  const go = (s: Suggestion) => {
    setOpen(false);
    router.push(`${basePath}/${s.id}`);
  };

  return (
    <div ref={box} className="relative min-w-72 flex-1">
      <span className="sr-only" id={`${listId}-label`}>
        Tìm hồ sơ
      </span>
      <Input
        type="search"
        name="q"
        value={value}
        maxLength={200}
        autoComplete="off"
        role="combobox"
        aria-labelledby={`${listId}-label`}
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        placeholder="Tìm số văn bản, tên người, trích yếu, nội dung…"
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          else if (show && e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => (a + 1) % items.length);
          } else if (show && e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
          } else if (show && e.key === 'Enter' && active >= 0) {
            e.preventDefault();
            const s = items[active];
            if (s) go(s);
          }
        }}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label="Gợi ý hồ sơ"
        hidden={!show}
        className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 list-none overflow-auto rounded-[10px] border border-line-strong bg-surface p-1 shadow-lg"
      >
        {items.map((s, i) => (
          <li
            key={s.id}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            className={
              'cursor-pointer rounded-lg px-3 py-2 text-sm ' +
              (i === active ? 'bg-surface-2' : 'hover:bg-surface-2')
            }
            onMouseDown={(e) => {
              e.preventDefault();
              go(s);
            }}
          >
            <span className="block truncate font-semibold">{s.title}</span>
            <span className="muted block truncate text-xs">
              {[
                s.creator_name,
                s.branch_name,
                `${s.document_count} tài liệu · ${s.scan_count} scan`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
