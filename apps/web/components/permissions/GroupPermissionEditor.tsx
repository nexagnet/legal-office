'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { postJson } from '../../lib/post-json';
import {
  isOverridable,
  permissionLabel,
  permissionMessage,
  sameSet,
} from '../../lib/permission-model';
import { PermissionTree } from './PermissionTree';

/**
 * Sửa quyền của nhóm bằng ma trận 7 nghiệp vụ x 6 hành động x 2 phạm vi cùng các quyền đặc biệt. Chỉ Admin; áp dụng ngay.
 * So tập quyền mong muốn với quyền hiện có của nhóm rồi gửi từng thay đổi (thêm/thu hồi) cùng một lý do; mỗi thay đổi
 * một dòng nhật ký. Quyền quản trị phân quyền (chỉ theo nhóm) không sửa ở đây.
 */
export function GroupPermissionEditor({
  groupId,
  permissions,
}: {
  readonly groupId: string;
  readonly permissions: readonly string[];
}) {
  const router = useRouter();
  const start = useMemo(() => new Set(permissions.filter(isOverridable)), [permissions]);
  const [value, setValue] = useState<ReadonlySet<string>>(start);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = !sameSet(value, start);
  const adds = [...value].filter((c) => !start.has(c));
  const drops = [...start].filter((c) => !value.has(c));

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reason.trim()) return setError(permissionMessage('REASON_REQUIRED'));
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      const changes = [
        ...adds.map((permission) => ({ kind: 'GRANT', permission })),
        ...drops.map((permission) => ({ kind: 'REVOKE', permission })),
      ];
      for (const c of changes) {
        const r = await postJson(`/dms/groups/${groupId}/changes`, {
          ...c,
          reason: reason.trim(),
        });
        if (!r.ok) {
          router.refresh();
          return setError(`${permissionLabel(c.permission)}: ${permissionMessage(r.code)}`);
        }
      }
      setOk(true);
      setReason('');
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit} aria-label="Sửa quyền của nhóm">
      <PermissionTree
        baseline={start}
        value={value}
        onChange={(n) => {
          setOk(false);
          setValue(n);
        }}
      />
      <label className="grid gap-1 text-sm font-semibold">
        Lý do
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={1000}
          autoComplete="off"
          className="font-normal"
        />
      </label>
      <p className="muted" aria-live="polite">
        {dirty
          ? `Sẽ thêm ${adds.length} quyền và thu hồi ${drops.length} quyền; có hiệu lực ngay.`
          : 'Chưa có thay đổi.'}
      </p>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
      <p role="status" className="text-sm text-ok" hidden={!ok}>
        Đã lưu quyền của nhóm, có hiệu lực ngay.
      </p>
      <div>
        <button type="submit" className="primary" disabled={busy || !dirty} aria-busy={busy}>
          Lưu quyền của nhóm
        </button>
      </div>
    </form>
  );
}
