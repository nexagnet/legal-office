'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { postJson } from '../../lib/post-json';
import { permissionMessage } from '../../lib/permission-model';

/**
 * Xóa một nhóm quyền tùy chỉnh. Máy chủ chỉ cho xóa khi nhóm không còn thành viên và chưa có lịch sử thay đổi; nhóm Admin
 * hệ thống và nhóm mẫu không xóa được. Xóa xong quay về danh sách nhóm.
 */
export function DeleteGroupButton({
  groupId,
  name,
}: {
  readonly groupId: string;
  readonly name: string;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const r = await postJson(`/dms/groups/${groupId}/delete`, {});
      if (!r.ok) return setError(permissionMessage(r.code));
      dialog.current?.close();
      router.push('/quan-tri/phan-quyen?tab=nhom');
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
        className="danger-outline"
        onClick={() => {
          setError(null);
          dialog.current?.showModal();
        }}
      >
        Xóa nhóm
      </button>
      <dialog ref={dialog} className="branch-dialog" aria-labelledby={`group-del-${groupId}`}>
        <div className="form">
          <h2 id={`group-del-${groupId}`}>Xóa nhóm “{name}”?</h2>
          <p className="muted">
            Chỉ xóa được nhóm không còn thành viên và chưa có lịch sử thay đổi. Việc xóa được ghi
            vào nhật ký và không hoàn tác.
          </p>
          <p role="alert" className="error" hidden={!error}>
            {error}
          </p>
          <div className="admin-toolbar">
            <button type="button" onClick={() => dialog.current?.close()}>
              Giữ nhóm
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy}
              aria-busy={busy}
              onClick={confirm}
            >
              Xóa nhóm
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
