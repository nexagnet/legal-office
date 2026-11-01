'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { postJson } from '../../lib/post-json';
import { permissionMessage } from '../../lib/permission-model';

/** Quyết định duyệt / từ chối một yêu cầu đổi quyền. Từ chối bắt buộc có lý do; quyền thật do DB kiểm. */
export function ReviewPanel({
  requestId,
  impact,
}: {
  readonly requestId: string;
  /** Số người bị ảnh hưởng, để ghi lên nút Duyệt. */
  readonly impact: number;
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function decide(approve: boolean) {
    if (!approve && !reason.trim()) return setError(permissionMessage('REASON_REQUIRED'));
    setBusy(true);
    setError(null);
    try {
      const r = await postJson(`/dms/permission-requests/${requestId}/review`, {
        approve,
        reason: reason.trim() || null,
      });
      if (!r.ok) return setError(permissionMessage(r.code));
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void decide(true);
      }}
    >
      <label className="grid gap-1 text-sm font-semibold text-muted">
        Lý do (bắt buộc khi từ chối)
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={1000}
          autoComplete="off"
          className="min-h-11 rounded-[10px] border border-line-strong bg-surface px-4 font-normal text-ink"
        />
      </label>
      <div className="req-buttons flex flex-wrap justify-end gap-3">
        <button
          type="button"
          className="danger-outline"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void decide(false)}
        >
          Từ chối
        </button>
        <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
          Duyệt và áp dụng{impact > 1 ? ` cho ${impact} người` : ''}
        </button>
      </div>
      <p className="text-[13px] text-muted">
        Khi duyệt, hệ thống kiểm tra lại nhóm. Nếu nhóm đã đổi, yêu cầu bị chặn và phải gửi lại. Mọi
        quyết định ghi vào Nhật ký phân quyền.
      </p>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
    </form>
  );
}
