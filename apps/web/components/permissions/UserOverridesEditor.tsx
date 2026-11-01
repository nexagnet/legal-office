'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { postJson } from '../../lib/post-json';
import { permissionMessage, sameSet } from '../../lib/permission-model';
import { PermissionTree } from './PermissionTree';

/**
 * Chỉnh quyền chi tiết của một tài khoản sau khi đã tạo (cùng cây quyền với lúc tạo). Chỉ Admin; áp dụng ngay, bắt buộc lý do,
 * có nhật ký. Gửi cả tập quyền mong muốn; máy chủ tự suy ra phần thêm riêng / bỏ riêng so với nhóm.
 */
export function UserOverridesEditor({
  officeId,
  userId,
  baseline,
  current,
  groupOnly,
  canEdit,
}: {
  readonly officeId: string;
  readonly userId: string;
  /** Quyền (chỉnh riêng được) mà các nhóm cho. */
  readonly baseline: readonly string[];
  /** Tập quyền hiệu lực hiện tại (đã tính quyền riêng). */
  readonly current: readonly string[];
  readonly groupOnly: readonly string[];
  readonly canEdit: boolean;
}) {
  const router = useRouter();
  const base = useMemo(() => new Set(baseline), [baseline]);
  const start = useMemo(() => new Set(current), [current]);
  const [value, setValue] = useState<ReadonlySet<string>>(start);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = !sameSet(value, start);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      const r = await postJson('/dms/user-overrides', {
        officeId,
        userId,
        permissions: [...value],
        reason: String(f.get('reason') ?? '').trim(),
      });
      if (!r.ok)
        return setError(
          r.code === 'NO_CHANGE'
            ? 'Không có gì thay đổi so với quyền hiện tại.'
            : permissionMessage(r.code),
        );
      setOk(true);
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit} aria-label="Chỉnh quyền chi tiết">
      <PermissionTree
        baseline={base}
        value={value}
        onChange={(n) => {
          setOk(false);
          setValue(n);
        }}
        disabled={!canEdit}
        groupOnly={groupOnly}
      />
      {canEdit ? (
        <>
          <label className="grid gap-1 text-sm font-semibold">
            Lý do
            <input name="reason" required maxLength={1000} className="font-normal" />
          </label>
          <p role="alert" className="error" hidden={!error}>
            {error}
          </p>
          <p role="status" className="text-sm text-ok" hidden={!ok}>
            Đã lưu quyền riêng, có hiệu lực ngay.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="primary" disabled={busy || !dirty} aria-busy={busy}>
              Lưu quyền riêng
            </button>
            <button
              type="button"
              className="btn-link"
              disabled={busy || !sameSet(value, base)}
              onClick={() => setValue(new Set(base))}
            >
              Quay về đúng theo nhóm
            </button>
          </div>
        </>
      ) : null}
    </form>
  );
}
