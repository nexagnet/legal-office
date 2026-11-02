'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Columns3, Rows3 } from 'lucide-react';
import { cn } from '../../lib/cn';

/** Chỉ hiện thanh công cụ khi bảng đủ rộng để người dùng cần ẩn bớt cột. */
const TOOLBAR_MIN_COLUMNS = 5;
const STORE_PREFIX = 'lo-table:';

interface Prefs {
  readonly hidden: readonly number[];
  readonly compact: boolean;
}

const DEFAULT_PREFS: Prefs = { hidden: [], compact: false };

function readPrefs(key: string): Prefs {
  try {
    const raw = window.localStorage.getItem(STORE_PREFIX + key);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      hidden: Array.isArray(p.hidden) ? p.hidden.filter((n) => Number.isInteger(n)) : [],
      compact: p.compact === true,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writePrefs(key: string, prefs: Prefs): void {
  try {
    window.localStorage.setItem(STORE_PREFIX + key, JSON.stringify(prefs));
  } catch {
    /* trình duyệt chặn lưu trữ: bỏ qua, lựa chọn chỉ có hiệu lực trong phiên */
  }
}

/**
 * Vỏ bảng dùng chung: giữ nguyên <table> bên trong và bổ sung
 * cột đầu + cột thao tác cố định, chữ dài cắt "…" (rê chuột xem đủ), đầu bảng dính,
 * nút "Cột hiển thị" (lưu theo trình duyệt của từng người) và chế độ gọn.
 * Không bao giờ tự bỏ cột: mặc định hiện đủ.
 */
export function DataTable({
  tableKey,
  className,
  children,
}: {
  readonly tableKey: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const scopeId = useId().replace(/:/g, '');
  const wrapRef = useRef<HTMLDivElement>(null);
  const [labels, setLabels] = useState<readonly string[]>([]);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [open, setOpen] = useState(false);
  const [edge, setEdge] = useState<{ readonly left: boolean; readonly right: boolean }>({
    left: false,
    right: false,
  });

  useEffect(() => {
    setPrefs(readPrefs(tableKey));
  }, [tableKey]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const read = () => {
      const cells = wrap.querySelectorAll('thead tr:first-child > th');
      const next = Array.from(cells, (c) => (c.textContent ?? '').trim());
      setLabels((prev) =>
        prev.length === next.length && prev.every((l, i) => l === next[i]) ? prev : next,
      );
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(wrap, { childList: true, subtree: true });
    // Dấu hiệu còn nội dung cuộn ngang: bóng mờ ở mép phải/trái
    const measure = () => {
      const left = wrap.scrollLeft > 1;
      const right = wrap.scrollLeft + wrap.clientWidth < wrap.scrollWidth - 1;
      setEdge((p) => (p.left === left && p.right === right ? p : { left, right }));
    };
    measure();
    wrap.addEventListener('scroll', measure, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(wrap);
    return () => {
      mo.disconnect();
      ro?.disconnect();
      wrap.removeEventListener('scroll', measure);
    };
  }, []);

  const update = useCallback(
    (next: Prefs) => {
      setPrefs(next);
      writePrefs(tableKey, next);
    },
    [tableKey],
  );

  const toggleColumn = (index: number) => {
    const hidden = prefs.hidden.includes(index)
      ? prefs.hidden.filter((i) => i !== index)
      : [...prefs.hidden, index];
    update({ ...prefs, hidden });
  };

  // Rê chuột vào ô bị cắt thì hiện đủ nội dung qua thuộc tính title.
  const onMouseOver = (e: React.MouseEvent<HTMLDivElement>) => {
    const cell = (e.target as HTMLElement).closest('td, th');
    if (!cell || cell.hasAttribute('title')) return;
    const clamped = Array.from(cell.querySelectorAll<HTMLElement>('.dms-clamp')).some(
      (el) => el.scrollHeight > el.clientHeight + 1,
    );
    if (clamped || cell.scrollWidth > cell.clientWidth + 1) {
      cell.setAttribute('title', (cell.textContent ?? '').trim());
    }
  };

  const css = useMemo(
    () =>
      prefs.hidden
        .map((i) => `[data-dt="${scopeId}"] tr > :nth-child(${i + 1}){display:none}`)
        .join(''),
    [prefs.hidden, scopeId],
  );

  const showToolbar = labels.length >= TOOLBAR_MIN_COLUMNS;

  return (
    <div className="dt" data-dt={scopeId} data-compact={prefs.compact ? 'true' : undefined}>
      {css ? <style>{css}</style> : null}
      {showToolbar ? (
        <div className="dt-toolbar">
          <div className="dt-menu">
            <button
              type="button"
              className="dt-btn"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <Columns3 aria-hidden="true" />
              <span className="dt-label">Cột hiển thị</span>
              {prefs.hidden.length > 0 ? (
                <span className="dt-count">
                  {labels.length - prefs.hidden.length}/{labels.length}
                </span>
              ) : null}
            </button>
            {open ? (
              <div className="dt-popover" role="group" aria-label="Cột hiển thị">
                {labels.map((label, i) => (
                  <label key={`${i}-${label}`}>
                    <input
                      type="checkbox"
                      checked={!prefs.hidden.includes(i)}
                      onChange={() => toggleColumn(i)}
                    />
                    <span>{label || `Cột ${i + 1}`}</span>
                  </label>
                ))}
                {prefs.hidden.length > 0 ? (
                  <button
                    type="button"
                    className="dt-reset"
                    onClick={() => update({ ...prefs, hidden: [] })}
                  >
                    Hiện tất cả
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="dt-btn"
            aria-pressed={prefs.compact}
            onClick={() => update({ ...prefs, compact: !prefs.compact })}
          >
            <Rows3 aria-hidden="true" />
            <span className="dt-label">Hiển thị gọn</span>
          </button>
        </div>
      ) : null}
      <div
        className="dt-frame"
        data-edge-left={edge.left ? 'true' : undefined}
        data-edge-right={edge.right ? 'true' : undefined}
      >
        <div
          ref={wrapRef}
          className={cn('table-wrap dt-scroll', className)}
          onMouseOver={onMouseOver}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
