'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { postJson } from '../../lib/post-json';
import { permissionMessage } from '../../lib/permission-model';

/**
 * Ngừng dùng / dùng lại một nhóm quyền (người có quyền duyệt, áp dụng ngay, lý do bắt buộc).
 * Ngừng dùng không xoá gì: thành viên, quyền và lịch sử còn nguyên, chỉ không còn cấp quyền hiệu lực.
 */
export function GroupStatusButton({
  groupId,
  retire,
}: {
  readonly groupId: string;
  readonly retire: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const verb = retire ? 'Ngừng dùng nhóm' : 'Dùng lại nhóm';

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const reason = String(new FormData(e.currentTarget).get('reason') ?? '').trim();
    setBusy(true);
    setError(null);
    try {
      const r = await postJson(`/dms/groups/${groupId}/status`, {
        status: retire ? 'RETIRED' : 'ACTIVE',
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
        className={retire ? 'danger-outline' : undefined}
        onClick={() => {
          setError(null);
          dialog.current?.showModal();
        }}
      >
        {verb}
      </button>
      <dialog ref={dialog} className="branch-dialog" aria-labelledby={`group-status-${groupId}`}>
        <form className="form" onSubmit={submit}>
          <h2 id={`group-status-${groupId}`}>{verb}</h2>
          <p className="muted">
            {retire
              ? 'Thành viên của nhóm mất quyền hiệu lực ngay. Không xoá gì: nhóm, quyền, thành viên và lịch sử vẫn còn, có thể dùng lại.'
              : 'Thành viên của nhóm có lại quyền hiệu lực ngay.'}
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
