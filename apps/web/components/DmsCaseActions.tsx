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

const ACCEPT = 'application/pdf,image/jpeg,image/png';

/** Tải lần lượt từng tệp lên một tài liệu đã có. Dừng ở tệp lỗi đầu tiên, trả số tệp đã tải và thông báo lỗi. */
export async function uploadFilesTo(
  documentId: string,
  files: readonly File[],
  isScan: boolean,
  /** Tên đặt cho từng tệp (cùng thứ tự với `files`); trống thì dùng tên tệp. */
  names: readonly string[] = [],
): Promise<{ readonly done: number; readonly error: string | null }> {
  let done = 0;
  for (const [i, file] of files.entries()) {
    const name = names[i]?.trim() || file.name;
    const q = new URLSearchParams({ label: name.slice(0, 200), isScan: String(isScan) });
    const res = await fetch(`/api/dms/documents/${documentId}/files?${q}`, {
      method: 'POST',
      headers: { 'content-type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      return { done, error: `${file.name}: ${messageFor(json.code)}` };
    }
    done += 1;
  }
  return { done, error: null };
}

/**
 * Tải lên nhiều tệp một lượt vào tài liệu chung "Tài liệu khác" của hồ sơ (tạo ở lần tải đầu tiên, mỗi hồ sơ chỉ một).
 * Không hỏi loại, không hỏi tên: nhãn là tên tệp; mặc định tính là bản scan. Trả số tệp đã tải và mã lỗi đầu tiên (nếu có).
 */
export async function uploadUnclassified(
  caseId: string,
  files: readonly File[],
  isScan = true,
  names: readonly string[] = [],
): Promise<{ readonly done: number; readonly error: string | null }> {
  const keep = files.map((f, i) => ({ f, name: names[i] ?? '' })).filter((x) => x.f.size > 0);
  const list = keep.map((x) => x.f);
  if (list.length === 0) return { done: 0, error: null };
  const made = await fetch(`/api/dms/cases/${caseId}/other-document`, { method: 'POST' });
  const madeJson = (await made.json().catch(() => ({}))) as { code?: string; label?: string };
  if (!made.ok || !madeJson.label) return { done: 0, error: messageFor(madeJson.code) };
  return uploadFilesTo(
    madeJson.label,
    list,
    isScan,
    keep.map((x) => x.name),
  );
}

/** Ô tải lên không giới hạn số tệp, không phân loại (cả hồ sơ nháp lẫn đã ghi sổ). */
export function DmsMultiUpload({ caseId }: { readonly caseId: string }) {
  const { error, busy, setError, setBusy, router } = useSender();
  const [note, setNote] = useState<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem('files');
    const files = input instanceof HTMLInputElement ? [...(input.files ?? [])] : [];
    if (files.length === 0) return setError('Hãy chọn ít nhất một tệp PDF, JPEG hoặc PNG.');
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const r = await uploadUnclassified(caseId, files);
      if (r.done > 0) setNote(`Đã tải lên ${r.done}/${files.length} tệp.`);
      if (r.error) setError(r.error);
      else form.reset();
      if (r.done > 0) router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-4 shadow-sm"
      aria-label="Tải tài liệu lên"
    >
      <input
        type="file"
        name="files"
        multiple
        accept={ACCEPT}
        aria-label="Chọn tệp"
        className="min-w-0 max-w-full flex-1 text-[13px] file:mr-3 file:cursor-pointer file:rounded-[10px] file:border-0 file:bg-accent-soft file:px-4 file:py-2 file:text-[13px] file:font-semibold file:text-accent"
      />
      <Button type="submit" variant="secondary" loading={busy}>
        Tải lên
      </Button>
      <p className="m-0 w-full text-xs text-muted">PDF, JPEG hoặc PNG, chọn nhiều tệp được.</p>
      {note ? (
        <p role="status" className="m-0 w-full text-sm">
          {note}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 w-full text-sm">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/**
 * Tải lên một tệp MỚI (không ghi đè) cho tài liệu. Cho cả hồ sơ nháp lẫn đã ghi sổ (bổ sung).
 * Ô "Tài liệu khác" của hồ sơ chưa có tài liệu loại này: truyền `otherForCaseId` thay cho `documentId`, tài liệu được
 * tạo ngay lần tải đầu tiên (máy chủ bảo đảm mỗi hồ sơ chỉ có một).
 */
export function UploadDmsFile({
  documentId,
  otherForCaseId,
}: {
  readonly documentId?: string;
  readonly otherForCaseId?: string;
}) {
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
      let target = documentId;
      if (!target) {
        const made = await fetch(`/api/dms/cases/${otherForCaseId}/other-document`, {
          method: 'POST',
        });
        const madeJson = (await made.json().catch(() => ({}))) as { code?: string; label?: string };
        if (!made.ok || !madeJson.label) return setError(messageFor(madeJson.code));
        target = madeJson.label;
      }
      const q = new URLSearchParams({ label, isScan: f.get('isScan') === 'on' ? 'true' : 'false' });
      const res = await fetch(`/api/dms/documents/${target}/files?${q}`, {
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
      id={`tai-len-${documentId ?? 'khac'}`}
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
        placeholder="Tên tệp (tùy chọn)"
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
            description="Bản nháp sẽ chuyển sang mục Đã hủy."
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
            description="Sau khi lưu chính thức, hồ sơ không thể sửa trực tiếp hay xóa. Chỉ Admin sửa được nội dung (có lý do); nhân viên chỉ tải thêm scan."
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
