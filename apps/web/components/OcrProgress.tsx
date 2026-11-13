'use client';

import { RotateCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { messageFor } from '../lib/messages';
import { ocrIsActive, ocrLabel, ocrPercent, type OcrProgressInfo } from '../lib/ocr-progress';

const FIRST_MS = 3_000;
const MAX_MS = 15_000;
const MAX_ERRORS = 5;

/**
 * Tiến độ OCR của một tệp tài liệu mới. Khi còn chờ/đang chạy thì hỏi máy chủ vài giây một lần (giãn dần, tạm dừng khi tab ẩn,
 * dừng hẳn khi xong hoặc lỗi). Không dùng cho tài liệu cũ.
 */
export function OcrProgress({
  fileId,
  initial,
  canRetry = false,
}: {
  readonly fileId: string;
  readonly initial: OcrProgressInfo;
  /** Người xem được thêm tài liệu thì thấy nút "Thử lại" khi OCR lỗi. */
  readonly canRetry?: boolean;
}) {
  const [info, setInfo] = useState<OcrProgressInfo>(initial);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
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

  async function retry() {
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch(`/api/dms/files/${encodeURIComponent(fileId)}/ocr-retry`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setRetryError(messageFor(json.code));
      errors.current = 0;
      setInfo({ status: 'PENDING', done: null, total: null });
    } catch {
      setRetryError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setRetrying(false);
    }
  }

  const pct = ocrPercent(info);
  // Chip trạng thái dạng viên thuốc như Figma T1/T3: xong = xanh lá, đang chạy = cam, lỗi = đỏ.
  const tone =
    info.status === 'FAILED'
      ? 'bg-[#fdecec] text-danger'
      : info.status === 'DONE'
        ? 'bg-[#e4f6ec] text-[#0f7a45]'
        : 'bg-[#fdf0d5] text-[#a35a00]';
  return (
    <>
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}
        data-testid="ocr-progress"
      >
        {ocrLabel(info)}
      </span>
      {info.status === 'RUNNING' && pct !== null ? (
        <span
          role="progressbar"
          aria-label="Tiến độ OCR"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="block h-1 w-full overflow-hidden rounded-full bg-head"
        >
          <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
        </span>
      ) : null}
      {info.status === 'FAILED' && canRetry ? (
        <button
          type="button"
          onClick={() => void retry()}
          disabled={retrying}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 py-1 text-xs font-semibold text-ink hover:bg-accent-soft disabled:opacity-60"
        >
          <RotateCw
            size={13}
            aria-hidden="true"
            className={retrying ? 'animate-spin' : undefined}
          />
          {retrying ? 'Đang gửi…' : 'Thử lại OCR'}
        </button>
      ) : null}
      {retryError ? (
        <span role="alert" className="text-xs text-danger">
          {retryError}
        </span>
      ) : null}
    </>
  );
}
