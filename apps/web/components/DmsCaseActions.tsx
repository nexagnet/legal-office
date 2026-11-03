'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';
import { Button } from './ui/button';
import { ConfirmModal } from './ui/confirm-modal';
import { Modal } from './ui/dialog';
import { Input } from './ui/field';

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
      className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl bg-surface p-4 shadow-sm"
      aria-label="Thêm tài liệu"
    >
      <label className="flex flex-col gap-1 text-[13px] font-semibold">
        Loại tài liệu
        <Input name="kind" required maxLength={100} />
      </label>
      <label className="flex min-w-60 flex-1 flex-col gap-1 text-[13px] font-semibold">
        Tên tài liệu
        <Input name="title" required maxLength={500} />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-[13px] font-semibold">
        <input type="checkbox" name="isOfficial" /> Văn bản chính thức
      </label>
      <Button type="submit" variant="secondary" loading={busy}>
        + Thêm tài liệu
      </Button>
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
      id={`tai-len-${documentId}`}
      className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-head p-3 text-sm"
      aria-label="Tải tệp lên"
    >
      <input
        type="file"
        name="file"
        accept="application/pdf,image/jpeg,image/png"
        required
        className="min-w-0 max-w-full text-[13px] file:mr-3 file:cursor-pointer file:rounded-[10px] file:border-0 file:bg-accent-soft file:px-4 file:py-2 file:text-[13px] file:font-semibold file:text-accent"
      />
      <Input
        name="label"
        placeholder="Tên tệp (tuỳ chọn)"
        maxLength={200}
        className="min-w-48 flex-1"
      />
      <label className="flex items-center gap-2 font-semibold">
        <input type="checkbox" name="isScan" defaultChecked /> Bản scan
      </label>
      <Button type="submit" variant="secondary" loading={busy}>
        Tải lên
      </Button>
      {error ? (
        <p role="alert" className="m-0 w-full">
          {error}
        </p>
      ) : null}
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
  const [cancelling, setCancelling] = useState(false);
  return (
    <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
      {canCancel ? (
        <>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => setCancelling(true)}
          >
            Hủy nháp
          </Button>
          <Modal
            open={cancelling}
            onOpenChange={setCancelling}
            title="Hủy bản nháp?"
            description="Bản nháp chưa cấp số hồ sơ, chưa vào sổ. Hủy xong bản nháp biến khỏi danh sách nháp và chuyển sang mục Đã hủy."
          >
            <form
              aria-label="Hủy bản nháp"
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (reason.trim() === '') return;
                void send(`/api/dms/cases/${caseId}/cancel-draft`, { reason: reason.trim() }).then(
                  (ok) => ok && setCancelling(false),
                );
              }}
            >
              <label className="grid gap-1 text-[13px] font-semibold">
                Lý do hủy nháp
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={1000}
                  required
                />
              </label>
              {error ? <p role="alert">{error}</p> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setCancelling(false)}>
                  Giữ bản nháp
                </Button>
                <Button
                  type="submit"
                  variant="danger"
                  loading={busy}
                  disabled={reason.trim() === ''}
                >
                  Xác nhận hủy
                </Button>
              </div>
            </form>
          </Modal>
        </>
      ) : null}
      {canRecord ? (
        <>
          <Button type="button" loading={busy} onClick={() => setConfirming(true)}>
            Xác nhận lưu chính thức
          </Button>
          <ConfirmModal
            open={confirming}
            onOpenChange={setConfirming}
            title="Xác nhận lưu chính thức"
            description="Sau khi xác nhận lưu chính thức, hồ sơ và tài liệu không thể sửa trực tiếp hay xoá. Chỉ Admin sửa được nội dung (có lý do, lưu thành phiên bản mới); nhân viên chỉ tải thêm scan."
            confirmLabel="Lưu chính thức"
            busy={busy}
            onConfirm={() => {
              void send(`/api/dms/cases/${caseId}/record`).then(() => setConfirming(false));
            }}
          />
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
