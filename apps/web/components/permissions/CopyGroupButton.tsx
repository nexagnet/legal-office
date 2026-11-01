'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { postJson } from '../../lib/post-json';
import { permissionMessage, type DmsGroup } from '../../lib/permission-model';

/**
 * "Sao chép nhóm" (Figma P3/P4): chọn nhóm nguồn (kể cả nhóm mẫu) và đặt tên; tạo nhóm tùy chỉnh mới có cùng quyền,
 * không chép quyền quản trị phân quyền, chưa có thành viên. Ai vào nhóm vẫn qua đề xuất có duyệt.
 */
export function CopyGroupButton({ groups }: { readonly groups: readonly DmsGroup[] }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (groups.length === 0) return null;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const source = String(f.get('source') ?? '');
    const name = String(f.get('name') ?? '').trim();
    setBusy(true);
    setError(null);
    try {
      const r = await postJson(`/dms/groups/${source}/copy`, { name });
      if (!r.ok) return setError(permissionMessage(r.code));
      dialog.current?.close();
      router.push(
        r.label ? `/quan-tri/phan-quyen/nhom/${r.label}` : '/quan-tri/phan-quyen?tab=nhom',
      );
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
        onClick={() => {
          setError(null);
          dialog.current?.showModal();
        }}
      >
        Sao chép nhóm
      </button>
      <dialog ref={dialog} className="branch-dialog" aria-labelledby="group-copy-t">
        <form className="form" onSubmit={submit}>
          <h2 id="group-copy-t">Sao chép nhóm quyền</h2>
          <p className="muted">
            Nhóm mới có cùng quyền nghiệp vụ nhưng không chép quyền quản trị phân quyền và chưa có
            thành viên. Thêm thành viên bằng đề xuất ở trang chi tiết nhóm.
          </p>
          <label>
            Nhóm nguồn
            <select name="source" required defaultValue={groups[0]?.id}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tên nhóm mới
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
              Sao chép
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
