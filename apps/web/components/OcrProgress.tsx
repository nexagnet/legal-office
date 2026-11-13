'use client';

import { RotateCw } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { messageFor } from '../lib/messages';
import { ocrIsActive, ocrLabel, ocrPercent, type OcrProgressInfo } from '../lib/ocr-progress';

const FIRST_MS = 3_000;
const MAX_MS = 15_000;
const MAX_ERRORS = 5;

/**
 * Tiến độ OCR của một tệp tài liệu mới. Khi còn chờ/đang chạy thì hỏi máy chủ vài giây một lần (giãn dần, tạm dừng khi tab ẩn,
 * dừng hẳn khi xong hoặc lỗi). Không dùng cho tài liệu cũ.
 */
function useOcr(fileId: string, initial: OcrProgressInfo) {
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

  return { info, retrying, retryError, retry };
}

type Ocr = ReturnType<typeof useOcr>;

function Chip({ info }: { readonly info: OcrProgressInfo }) {
  const pct = ocrPercent(info);
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
    </>
  );
}

function RetryButton({ ocr }: { readonly ocr: Ocr }) {
  return (
    <button
      type="button"
      onClick={() => void ocr.retry()}
      disabled={ocr.retrying}
      className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3 text-[13px] font-semibold text-ink hover:bg-surface-2 disabled:opacity-60"
    >
      <RotateCw
        size={14}
        aria-hidden="true"
        className={ocr.retrying ? 'animate-spin' : undefined}
      />
      {ocr.retrying ? 'Đang gửi…' : 'Thử lại OCR'}
    </button>
  );
}

const ErrorNote = ({ ocr }: { readonly ocr: Ocr }) =>
  ocr.retryError ? (
    <span role="alert" className="text-xs text-danger">
      {ocr.retryError}
    </span>
  ) : null;

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
  const ocr = useOcr(fileId, initial);
  return (
    <>
      <Chip info={ocr.info} />
      {ocr.info.status === 'FAILED' && canRetry ? <RetryButton ocr={ocr} /> : null}
      <ErrorNote ocr={ocr} />
    </>
  );
}

/**
 * Một dòng tệp (Figma T1/T3): tiêu đề + dòng chip bên trái; nút "Thử lại OCR" (khi lỗi) nằm cạnh các nút hành động bên phải,
 * nổi lên trên lớp phủ bấm-cả-dòng nên bấm được.
 */
export function OcrFileRow({
  fileId,
  initial,
  canRetry,
  title,
  chips,
  actions,
}: {
  readonly fileId: string;
  readonly initial: OcrProgressInfo;
  readonly canRetry: boolean;
  readonly title: ReactNode;
  readonly chips: ReactNode;
  readonly actions: ReactNode;
}) {
  const ocr = useOcr(fileId, initial);
  return (
    <>
      <div className="min-w-0 flex-1">
        {title}
        <p className="m-0 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {chips}
          <Chip info={ocr.info} />
        </p>
        <ErrorNote ocr={ocr} />
      </div>
      {ocr.info.status === 'FAILED' && canRetry ? (
        <span className="relative z-10 shrink-0">
          <RetryButton ocr={ocr} />
        </span>
      ) : null}
      {actions}
    </>
  );
}
