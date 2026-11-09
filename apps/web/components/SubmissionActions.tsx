'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';
import { stageFiles } from '../lib/stage-upload';
import { Button } from './ui/button';
import { Input, Textarea } from './ui/field';
import { Modal } from './ui/dialog';

const ACCEPT = 'application/pdf,image/jpeg,image/png';

/** Các tệp đã chọn trong ô `files` của form (đọc thẳng từ ô chọn tệp). */
const filesOf = (form: HTMLFormElement): File[] =>
  Array.from((form.elements.namedItem('files') as HTMLInputElement | null)?.files ?? []).filter(
    (x) => x.size > 0,
  );

/**
 * Nút "+ Trình mới" (N4): mọi thành viên văn phòng gửi được một bản trình gồm tiêu đề, mô tả và các bản scan. Bản trình
 * chờ Admin duyệt; người gửi chỉ thấy bản của mình. Tệp tải lên bước đệm trước, rồi gửi bản trình trong một lần gọi.
 */
export function NewSubmissionButton({ officeId }: { readonly officeId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const title = String(f.get('title') ?? '').trim();
    if (!title) return setError('Cần nhập tiêu đề.');
    setBusy(true);
    setError(null);
    try {
      const staged = await stageFiles(filesOf(form));
      if (!staged.ok) return setError(staged.error);
      const description = String(f.get('description') ?? '').trim();
      const res = await fetch('/api/dms/submissions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          officeId,
          title,
          ...(description ? { description } : {}),
          files: staged.files,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string; label?: string };
      if (!res.ok) return setError(messageFor(json.code));
      form.reset();
      setOpen(false);
      if (json.label) router.push(`/dms/trinh-duyet/${json.label}`);
      else router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        + Trình mới
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Trình mới"
        description="Gửi tiêu đề, mô tả và bản scan để Admin duyệt."
      >
        <form onSubmit={submit} className="grid gap-3" aria-label="Trình mới">
          <label className="grid gap-1 text-[13px] font-semibold">
            Tiêu đề
            <Input name="title" required maxLength={300} />
          </label>
          <label className="grid gap-1 text-[13px] font-semibold">
            Mô tả
            <Textarea name="description" maxLength={5000} rows={3} />
          </label>
          <label className="grid gap-1 text-[13px] font-semibold">
            Bản scan (PDF, JPEG hoặc PNG)
            <input type="file" name="files" accept={ACCEPT} multiple required />
          </label>
          {error ? <p role="alert">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={busy}>
              Gửi bản trình
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Bổ sung thêm bản scan vào bản trình còn chờ duyệt (người gửi hoặc Admin; máy chủ kiểm lại). */
export function AddSubmissionFiles({ submissionId }: { readonly submissionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    try {
      const staged = await stageFiles(filesOf(form));
      if (!staged.ok) return setError(staged.error);
      const res = await fetch(`/api/dms/submissions/${encodeURIComponent(submissionId)}/files`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ files: staged.files }),
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
      aria-label="Thêm bản scan"
    >
      <input type="file" name="files" accept={ACCEPT} multiple required />
      <Button type="submit" variant="secondary" loading={busy}>
        Thêm scan
      </Button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}

/** Admin duyệt hoặc từ chối. Từ chối bắt buộc có lý do; duyệt có thể kèm ghi chú. Không duyệt lại được. */
export function DecideSubmission({ submissionId }: { readonly submissionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean, form: HTMLFormElement) {
    const note = String(new FormData(form).get('note') ?? '').trim();
    if (!approve && !note) return setError('Từ chối cần nhập lý do.');
    setBusy(approve ? 'approve' : 'reject');
    setError(null);
    try {
      const res = await fetch(`/api/dms/submissions/${encodeURIComponent(submissionId)}/decide`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approve, ...(note ? { note } : {}) }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setError(messageFor(json.code));
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="grid gap-2 rounded-2xl bg-surface p-5 shadow-sm"
      aria-label="Duyệt bản trình"
    >
      <h2 className="m-0">Duyệt bản trình</h2>
      <label className="grid gap-1 text-[13px] font-semibold">
        Ghi chú (bắt buộc khi từ chối)
        <Textarea name="note" maxLength={2000} rows={2} />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          loading={busy === 'approve'}
          disabled={busy !== null}
          onClick={(e) => void decide(true, e.currentTarget.form!)}
        >
          Duyệt
        </Button>
        <Button
          type="button"
          variant="danger"
          loading={busy === 'reject'}
          disabled={busy !== null}
          onClick={(e) => void decide(false, e.currentTarget.form!)}
        >
          Từ chối
        </Button>
      </div>
    </form>
  );
}
