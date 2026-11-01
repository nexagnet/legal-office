'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';
import { ConfirmModal } from './ui/confirm-modal';

type Send = (path: string, body?: unknown) => Promise<boolean>;

function useSender() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const send: Send = async (path, body) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) {
        setError(messageFor(json.code));
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { send, error, busy, setError, setBusy, router };
}

/** Thêm một tài liệu vào hồ sơ NHÁP. */
export function AddDmsDocumentForm({ caseId }: { readonly caseId: string }) {
  const { send, error, busy } = useSender();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const ok = await send(`/api/dms/cases/${caseId}/documents`, {
      kind: String(f.get('kind') ?? '').trim(),
      title: String(f.get('title') ?? '').trim(),
      isOfficial: f.get('isOfficial') === 'on',
    });
    if (ok) form.reset();
  }
  return (
    <form
      onSubmit={submit}
      className="mb-4 flex flex-wrap items-end gap-3"
      aria-label="Thêm tài liệu"
    >
      <label className="flex flex-col gap-1 text-sm">
        Loại tài liệu
        <input name="kind" required maxLength={100} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Tên tài liệu
        <input name="title" required maxLength={500} className="min-w-72" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isOfficial" /> Văn bản chính thức
      </label>
      <button type="submit" disabled={busy}>
        + Thêm tài liệu
      </button>
      {error ? (
        <p role="alert" className="w-full text-sm">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/** Tải lên một tệp MỚI (không ghi đè) cho tài liệu. Cho cả hồ sơ nháp lẫn đã ghi sổ (bổ sung). */
export function UploadDmsFile({ documentId }: { readonly documentId: string }) {
  const { error, busy, setError, setBusy, router } = useSender();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const file = f.get('file');
    if (!(file instanceof File) || file.size === 0)
      return setError('Hãy chọn một tệp PDF, JPEG hoặc PNG.');
    const label = String(f.get('label') ?? '').trim() || file.name;
    setBusy(true);
    setError(null);
    try {
      const q = new URLSearchParams({ label, isScan: f.get('isScan') === 'on' ? 'true' : 'false' });
      const res = await fetch(`/api/dms/documents/${documentId}/files?${q}`, {
        method: 'POST',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setError(messageFor(json.code));
      form.reset();
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-2 text-sm"
      aria-label="Tải tệp lên"
    >
      <input type="file" name="file" accept="application/pdf,image/jpeg,image/png" required />
      <input name="label" placeholder="Tên tệp (tuỳ chọn)" maxLength={200} />
      <label className="flex items-center gap-1">
        <input type="checkbox" name="isScan" defaultChecked /> Bản scan
      </label>
      <button type="submit" disabled={busy}>
        Tải lên
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}

/** "Xác nhận lưu chính thức" và "Hủy nháp". Ghi sổ là không hoàn tác nên có hộp xác nhận. */
export function DmsDraftActions({
  caseId,
  canRecord,
  canCancel,
}: {
  readonly caseId: string;
  readonly canRecord: boolean;
  readonly canCancel: boolean;
}) {
  const { send, error, busy } = useSender();
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      {canRecord ? (
        <>
          <button type="button" disabled={busy} onClick={() => setConfirming(true)}>
            Xác nhận lưu chính thức
          </button>
          <ConfirmModal
            open={confirming}
            onOpenChange={setConfirming}
            title="Xác nhận lưu chính thức"
            description="Sau khi xác nhận lưu chính thức, hồ sơ và tài liệu không thể sửa trực tiếp hay xoá. Muốn thay đổi phải gửi yêu cầu sửa đổi."
            confirmLabel="Lưu chính thức"
            busy={busy}
            onConfirm={() => {
              void send(`/api/dms/cases/${caseId}/record`).then(() => setConfirming(false));
            }}
          />
        </>
      ) : null}
      {canCancel ? (
        <>
          <label className="flex flex-col gap-1 text-sm">
            Lý do hủy nháp
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              className="min-w-72"
            />
          </label>
          <button
            type="button"
            disabled={busy || reason.trim() === ''}
            onClick={() =>
              void send(`/api/dms/cases/${caseId}/cancel-draft`, { reason: reason.trim() })
            }
          >
            Hủy nháp
          </button>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="w-full text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
