'use client';

import { LoaderCircle } from 'lucide-react';
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';

/** Số lệnh lọc đang chờ máy chủ trả danh sách. Dùng chung giữa phễu lọc (ở tiêu đề cột) và khung bao quanh bảng. */
let busyCount = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const snapshot = () => busyCount > 0;

/** Báo "đang tải danh sách" khi `pending` đúng; tự bỏ khi hết hoặc khi phễu bị gỡ. */
export function useReportListBusy(pending: boolean) {
  useEffect(() => {
    if (!pending) return;
    busyCount += 1;
    emit();
    return () => {
      busyCount -= 1;
      emit();
    };
  }, [pending]);
}

/** Khung bao bảng: làm mờ bảng và hiện vòng quay trong lúc danh sách đang được lọc lại. */
export function DmsListBusy({ children }: { readonly children: ReactNode }) {
  const busy = useSyncExternalStore(subscribe, snapshot, () => false);
  return (
    <div className="relative" aria-busy={busy}>
      <div
        className={
          busy ? 'pointer-events-none opacity-50 transition-opacity' : 'transition-opacity'
        }
      >
        {children}
      </div>
      {busy ? (
        <div
          role="status"
          aria-label="Đang lọc danh sách"
          className="pointer-events-none absolute inset-x-0 top-24 z-10 flex justify-center"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-muted shadow-md">
            <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
            Đang lọc…
          </span>
        </div>
      ) : null}
    </div>
  );
}
