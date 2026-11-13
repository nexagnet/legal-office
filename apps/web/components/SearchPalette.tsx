'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { NavItem } from '../app/nav';
import { DMS_DOMAIN_LABEL, dmsCaseDocsHref } from '../lib/dms-domain-slugs';
import { searchEntries } from '../lib/search-entries';
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

/** Một hồ sơ khớp, đúng dạng dòng `GET /dms/case-search` trả về (tìm trên chỉ mục ở DB, đã lọc theo quyền xem). */
interface CaseHit {
  readonly id: string;
  readonly domain: string;
  readonly title: string;
  readonly case_number: string | null;
}

const CASE_LIMIT = 8;
/** Hộp thả chỉ hiện vài dòng đầu; xem hết ở trang "Kết quả tìm kiếm". */
const CONTENT_LIMIT = 5;
/** Chờ người dùng ngừng gõ rồi mới gọi máy chủ. */
const CONTENT_DEBOUNCE_MS = 300;

/**
 * Ô tìm kiếm trên đầu trang: tìm trang, hồ sơ (cả 4 nghiệp vụ và Văn thư, theo số hồ sơ, tiêu đề, khách hàng…) bạn được xem và nội dung (chữ OCR) trong tài liệu scan.
 * Mở bằng bấm hoặc Ctrl/⌘+K. Tìm hồ sơ và nội dung cần `officeId`; không có thì bỏ các nhóm đó.
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
  const [cases, setCases] = useState<readonly CaseHit[] | 'error' | null>(null);
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

  // Tìm hồ sơ ở máy chủ (chỉ mục, có số hồ sơ): không còn lọc trong 100 hồ sơ đầu tải về máy.
  const canSearchCases = open && Boolean(officeId) && q.length >= 2;
  useEffect(() => {
    setCases(null);
    if (!canSearchCases || !officeId) return;
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        officeId,
        q,
        limit: String(CASE_LIMIT),
        total: 'false',
      });
      fetch(`/api/dms/case-search?${params}`, { signal: ctl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<{ rows: CaseHit[] }>) : Promise.reject()))
        .then((b) => setCases(b.rows ?? []))
        .catch(() => {
          if (!ctl.signal.aborted) setCases('error');
        });
    }, CONTENT_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [canSearchCases, officeId, q]);

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

  const hits = useMemo(() => searchEntries(query, items, []), [query, items]);
  const caseRows = Array.isArray(cases) ? (cases as readonly CaseHit[]) : [];
  const caseHref = (c: CaseHit) => dmsCaseDocsHref(c.domain, c.id);
  const firstCaseHref = caseRows.map(caseHref).find(Boolean) ?? null;
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
            placeholder="Gõ số hồ sơ (vd 038/2026), tên trang hoặc khách hàng"
            aria-label="Từ khóa tìm kiếm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              if (hits[0]) go(hits[0].href);
              else if (firstCaseHref) go(firstCaseHref);
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
            <p className="search-empty">Không có kết quả phù hợp.</p>
          ) : null}
          {canSearchCases ? (
            <section className="search-content" aria-label="Hồ sơ">
              <h3 className="search-group">Hồ sơ</h3>
              {cases === null ? (
                <p className="search-empty" role="status">
                  Đang tìm hồ sơ…
                </p>
              ) : cases === 'error' ? (
                <p className="search-empty" role="alert">
                  Không tìm được hồ sơ. Thử lại sau.
                </p>
              ) : caseRows.length === 0 ? (
                <p className="search-empty" role="status">
                  Không có hồ sơ nào khớp “{q}”.
                </p>
              ) : (
                <ul className="search-results" aria-label="Kết quả hồ sơ">
                  {caseRows.map((c) => {
                    const href = caseHref(c);
                    return (
                      <li key={c.id}>
                        <button type="button" disabled={!href} onClick={() => href && go(href)}>
                          <strong>{c.case_number ?? c.title}</strong>
                          <small>
                            {DMS_DOMAIN_LABEL[c.domain] ?? c.domain}
                            {c.case_number ? ` · ${c.title}` : ''}
                          </small>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
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
