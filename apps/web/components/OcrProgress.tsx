'use client';

import { useEffect, useRef, useState } from 'react';
import { ocrIsActive, ocrLabel, ocrPercent, type OcrProgressInfo } from '../lib/dms';

const FIRST_MS = 3_000;
const MAX_MS = 15_000;
const MAX_ERRORS = 5;

/** Chỉ PDF và ảnh được OCR; loại khác không hiện gì. */
export function ocrApplies(mime: string): boolean {
  return mime === 'application/pdf' || mime.startsWith('image/');
}

/**
 * Tiến độ OCR của một tệp tài liệu mới. Khi còn chờ/đang chạy thì hỏi máy chủ vài giây một lần (giãn dần, tạm dừng khi tab ẩn,
 * dừng hẳn khi xong hoặc lỗi). Không dùng cho tài liệu cũ.
 */
export function OcrProgress({
  fileId,
  initial,
}: {
  readonly fileId: string;
  readonly initial: OcrProgressInfo;
}) {
  const [info, setInfo] = useState<OcrProgressInfo>(initial);
  const active = ocrIsActive(info.status);
  const errors = useRef(0);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = FIRST_MS;

    const tick = async () => {
      if (stopped) return;
      if (document.hidden) {
        timer = setTimeout(tick, delay);
        return;
      }
      try {
        const res = await fetch(`/api/dms/files/ocr-status?ids=${encodeURIComponent(fileId)}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as {
          rows: {
            ocr_status: OcrProgressInfo['status'];
            ocr_pages_done: number | null;
            ocr_pages_total: number | null;
          }[];
        };
        const r = body.rows[0];
        errors.current = 0;
        if (r && !stopped) {
          const next = { status: r.ocr_status, done: r.ocr_pages_done, total: r.ocr_pages_total };
          setInfo(next);
          if (!ocrIsActive(next.status)) return;
        }
      } catch {
        errors.current += 1;
        if (errors.current >= MAX_ERRORS) return;
      }
      delay = Math.min(MAX_MS, Math.round(delay * 1.5));
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, delay);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, fileId]);

  const pct = ocrPercent(info);
  const tone =
    info.status === 'FAILED'
      ? 'text-danger'
      : info.status === 'DONE'
        ? 'text-muted'
        : 'text-accent';
  return (
    <span className="inline-flex items-center gap-2 text-xs" data-testid="ocr-progress">
      {info.status === 'RUNNING' && pct !== null ? (
        <span
          role="progressbar"
          aria-label="Tiến độ OCR"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="h-1.5 w-20 overflow-hidden rounded-full bg-head"
        >
          <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
        </span>
      ) : null}
      <span className={tone}>{ocrLabel(info)}</span>
    </span>
  );
}
