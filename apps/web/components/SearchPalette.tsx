'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { NavItem } from '../app/nav';
import { dmsCaseDocsHref } from '../lib/dms-domain-slugs';
import { searchEntries, type SearchCase } from '../lib/search-entries';
import { HighlightedText } from './HighlightedText';

/** Một kết quả tìm trong nội dung (chữ OCR của bản scan), đúng dạng `GET /dms/search` trả về. */
interface ContentHit {
  readonly case_id: string;
  readonly case_title: string;
  readonly domain: string;
  readonly document_title: string;
  readonly file_id: string;
  readonly file_label: string;
  readonly snippet: string;
}

/** Hộp thả chỉ hiện vài dòng đầu; xem hết ở trang "Kết quả tìm kiếm". */
const CONTENT_LIMIT = 5;
/** Chờ người dùng ngừng gõ rồi mới gọi máy chủ. */
const CONTENT_DEBOUNCE_MS = 300;

/**
 * Ô tìm kiếm trên đầu trang: tìm trang, hồ sơ Vi bằng bạn được xem và nội dung (chữ OCR) trong tài liệu scan.
 * Mở bằng bấm hoặc Ctrl/⌘+K. Tìm nội dung cần `officeId`; không có thì bỏ nhóm đó.
 */
export function SearchPalette({
  items,
  officeId = null,
}: {
  readonly items: readonly NavItem[];
  readonly officeId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cases, setCases] = useState<readonly SearchCase[] | null>(null);
  const [content, setContent] = useState<readonly ContentHit[] | 'error' | null>(null);
  const q = query.trim();

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

  // Tìm trong nội dung tài liệu: chờ 300 ms sau lần gõ cuối, huỷ yêu cầu cũ khi gõ tiếp.
  const canSearchContent = open && Boolean(officeId) && q.length >= 2;
  useEffect(() => {
    if (!canSearchContent || !officeId) {
      setContent(null);
      return;
    }
    setContent(null);
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ officeId, q, limit: String(CONTENT_LIMIT) });
      fetch(`/api/dms/search?${params}`, { signal: ctl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<{ rows: ContentHit[] }>) : Promise.reject()))
        .then((b) => setContent(b.rows))
        .catch(() => {
          if (!ctl.signal.aborted) setContent('error');
        });
    }, CONTENT_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [canSearchContent, officeId, q]);

  const hits = useMemo(() => searchEntries(query, items, cases ?? []), [query, items, cases]);
  const allHref = `/dms/tim-kiem?q=${encodeURIComponent(q)}`;

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
              if (e.key !== 'Enter') return;
              if (hits[0]) go(hits[0].href);
              else if (canSearchContent) go(allHref);
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
          {q && hits.length === 0 && !canSearchContent ? (
            <p className="search-empty">
              {cases === null ? 'Đang tìm…' : 'Không có kết quả phù hợp.'}
            </p>
          ) : null}
          {canSearchContent ? (
            <section className="search-content" aria-label="Trong nội dung tài liệu">
              <h3 className="search-group">Trong nội dung tài liệu</h3>
              {content === null ? (
                <p className="search-empty" role="status">
                  Đang tìm trong nội dung…
                </p>
              ) : content === 'error' ? (
                <p className="search-empty" role="alert">
                  Không tìm được trong nội dung. Thử lại sau.
                </p>
              ) : content.length === 0 ? (
                <p className="search-empty" role="status">
                  Không có tài liệu nào có chữ “{q}”.
                </p>
              ) : (
                <ul className="search-results" aria-label="Kết quả trong nội dung">
                  {content.map((r) => {
                    const href = dmsCaseDocsHref(r.domain, r.case_id);
                    return (
                      <li key={r.file_id}>
                        <button type="button" disabled={!href} onClick={() => href && go(href)}>
                          <strong>{r.case_title}</strong>
                          <small>
                            {r.document_title} · {r.file_label}
                          </small>
                          <span className="search-snippet">
                            <HighlightedText text={r.snippet} query={q} />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <button type="button" className="search-all" onClick={() => go(allHref)}>
                Xem tất cả kết quả
              </button>
            </section>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
