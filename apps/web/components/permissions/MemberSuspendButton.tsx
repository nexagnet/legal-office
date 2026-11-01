'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { postJson } from '../../lib/post-json';
import { permissionMessage } from '../../lib/permission-model';

/**
 * Tạm khóa / mở khóa tài khoản (Figma Q1, Q2). Người có quyền duyệt phân quyền thực hiện, áp dụng ngay, lý do bắt buộc.
 * Tạm khóa không xoá gì: nhóm, hồ sơ và lịch sử vẫn còn, chỉ thu hồi phiên đăng nhập và quyền hiệu lực.
 */
export function MemberSuspendButton({
  userId,
  officeId,
  suspended,
}: {
  readonly userId: string;
  readonly officeId: string;
  readonly suspended: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const verb = suspended ? 'Mở khóa tài khoản' : 'Tạm khóa tài khoản';

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const reason = String(new FormData(e.currentTarget).get('reason') ?? '').trim();
    setBusy(true);
    setError(null);
    try {
      const r = await postJson(`/admin/members/${userId}/suspension`, {
        officeId,
        suspended: !suspended,
        reason,
      });
      if (!r.ok) return setError(permissionMessage(r.code));
      dialog.current?.close();
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={suspended ? undefined : 'danger-outline'}
        onClick={() => {
          setError(null);
          dialog.current?.showModal();
        }}
      >
        {verb}
      </button>
      <dialog ref={dialog} className="branch-dialog" aria-labelledby={`suspend-${userId}`}>
        <form className="form" onSubmit={submit}>
          <h2 id={`suspend-${userId}`}>{verb}</h2>
          <p className="muted">
            {suspended
              ? 'Người này đăng nhập lại được và có lại quyền theo các nhóm quyền hiện có.'
              : 'Đăng xuất người này ngay và thu hồi mọi quyền hiệu lực. Không xoá gì: nhóm quyền, hồ sơ và lịch sử vẫn còn, có thể mở khóa sau.'}
          </p>
          <label>
            Lý do
            <input name="reason" required maxLength={1000} autoComplete="off" />
          </label>
          <p role="alert" className="error" hidden={!error}>
            {error}
          </p>
          <div className="admin-toolbar">
            <button type="button" onClick={() => dialog.current?.close()}>
              Hủy
            </button>
            <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
              {verb}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
