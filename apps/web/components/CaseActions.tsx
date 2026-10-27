'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';

interface Props {
  readonly caseId: string;
  readonly title: string;
  readonly description: string;
  /** Còn trong 48 giờ liên tục từ lúc tạo (web chỉ gợi ý; DB quyết định). */
  readonly windowOpen: boolean;
  readonly isFinal: boolean;
  readonly canCancel: boolean;
  /** Chỉ hiện phần sửa/đề nghị, hoặc chỉ phần huỷ hồ sơ (vùng nguy hiểm); mặc định cả hai. */
  readonly section?: 'edit' | 'cancel' | 'all';
}

async function send(method: string, path: string, body: unknown) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { code?: string };
  return { ok: res.ok, code: json.code };
}

/** Sửa nội bộ (trong 48 giờ) hoặc lập đề nghị thay đổi (sau 48 giờ); Admin huỷ hồ sơ. Quyền thật do máy chủ kiểm. */
export function CaseActions({
  caseId,
  title,
  description,
  windowOpen,
  isFinal,
  canCancel,
  section = 'all',
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<{ ok: boolean; code?: string }>, ok: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await action();
      if (!r.ok) return setError(messageFor(r.code));
      setNotice(ok);
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  function edit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(
      () =>
        send('PUT', `/vibang/cases/${caseId}/details`, {
          title: String(f.get('title') ?? ''),
          description: String(f.get('description') ?? ''),
        }),
      'Đã lưu thay đổi.',
    );
  }

  function requestChange(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(
      () =>
        send('POST', `/vibang/cases/${caseId}/change-requests`, {
          field: String(f.get('field')),
          value: String(f.get('value') ?? ''),
          reason: String(f.get('reason') ?? ''),
        }),
      'Đã gửi đề nghị thay đổi, chờ Admin duyệt.',
    );
  }

  function cancel(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(
      () =>
        send('POST', `/vibang/cases/${caseId}/cancellation`, {
          reason: String(f.get('reason') ?? ''),
        }),
      'Đã huỷ hồ sơ.',
    );
  }

  return (
    <div className="stack">
      {section === 'cancel' ? null : isFinal ? (
        <p className="muted">Hồ sơ đã kết thúc, không thể sửa.</p>
      ) : windowOpen ? (
        <form className="card form" onSubmit={edit} aria-labelledby="edit-t">
          <h2 id="edit-t">Sửa thông tin nội bộ (trong 48 giờ)</h2>
          <label>
            Tiêu đề
            <input name="title" required maxLength={300} defaultValue={title} />
          </label>
          <label>
            Nội dung cần ghi nhận
            <textarea name="description" rows={3} maxLength={5000} defaultValue={description} />
          </label>
          <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
            Lưu
          </button>
        </form>
      ) : (
        <form className="card form" onSubmit={requestChange} aria-labelledby="req-t">
          <h2 id="req-t">Đề nghị thay đổi (đã quá 48 giờ)</h2>
          <label>
            Trường cần đổi
            <select name="field" defaultValue="title">
              <option value="title">Tiêu đề</option>
              <option value="description">Nội dung cần ghi nhận</option>
            </select>
          </label>
          <label>
            Giá trị mới
            <textarea name="value" required rows={2} maxLength={5000} />
          </label>
          <label>
            Lý do
            <input name="reason" required maxLength={2000} />
          </label>
          <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
            Gửi đề nghị
          </button>
        </form>
      )}
      {section !== 'edit' && canCancel && !isFinal ? (
        <form className="card form" onSubmit={cancel} aria-labelledby="cancel-t">
          <h2 id="cancel-t">Huỷ hồ sơ</h2>
          <label>
            Lý do huỷ
            <input name="reason" required maxLength={2000} />
          </label>
          <button type="submit" disabled={busy} aria-busy={busy}>
            Huỷ hồ sơ
          </button>
        </form>
      ) : null}
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
      <p role="status" className="success" hidden={!notice}>
        {notice}
      </p>
    </div>
  );
}
