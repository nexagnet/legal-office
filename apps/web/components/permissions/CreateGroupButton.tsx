'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { postJson } from '../../lib/post-json';
import { permissionMessage } from '../../lib/permission-model';

/** "Tạo nhóm quyền": chỉ đặt tên. Nhóm rỗng không cho ai quyền nào; quyền và thành viên vào nhóm qua đề xuất. */
export function CreateGroupButton({ officeId }: { readonly officeId: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get('name') ?? '').trim();
    setBusy(true);
    setError(null);
    try {
      const r = await postJson('/dms/groups', { officeId, name });
      if (!r.ok) return setError(permissionMessage(r.code));
      form.reset();
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
        className="primary"
        onClick={() => {
          setError(null);
          dialog.current?.showModal();
        }}
      >
        + Tạo nhóm quyền
      </button>
      <dialog ref={dialog} className="branch-dialog" aria-labelledby="group-add-t">
        <form className="form" onSubmit={submit}>
          <h2 id="group-add-t">Tạo nhóm quyền</h2>
          <p className="muted">
            Nhóm mới là nhóm trống, chưa cấp quyền nào. Thêm quyền và thành viên bằng đề xuất ở
            trang chi tiết nhóm.
          </p>
          <label>
            Tên nhóm
            <input name="name" required maxLength={200} autoComplete="off" />
          </label>
          <p role="alert" className="error" hidden={!error}>
            {error}
          </p>
          <div className="admin-toolbar">
            <button type="button" onClick={() => dialog.current?.close()}>
              Hủy
            </button>
            <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
              Tạo nhóm
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
