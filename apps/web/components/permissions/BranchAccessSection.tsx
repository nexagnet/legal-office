'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import type { BranchAccessRow, OfficeBranch } from '../../lib/dms-admin';
import { messageFor } from '../../lib/messages';
import { postJson } from '../../lib/post-json';
import { Pill } from './Pill';

const branchMessage = (code: string | undefined): string =>
  code === 'NO_CHANGE'
    ? 'Không có gì thay đổi: chi nhánh này đã được cấp (hoặc đã thu hồi) trước đó.'
    : messageFor(code);

type Action =
  { readonly kind: 'grant' } | { readonly kind: 'revoke'; readonly branch: OfficeBranch };

/**
 * Chi nhánh được xem (quyết định owner 2026-11-01): người dùng chỉ thấy hồ sơ và bản ghi của chi nhánh được cấp, kể cả Văn thư
 * xem sổ. Nhóm quyền nói "làm được gì", mục này nói "ở đâu". Người có quyền duyệt phân quyền cấp/thu hồi, áp dụng ngay, có lý do
 * và nhật ký; thu hồi không xoá gì. Cấp phát cũ theo vai (LEGACY) vẫn có hiệu lực nhưng chỉ hiển thị ở đây.
 */
export function BranchAccessSection({
  officeId,
  userId,
  branches,
  granted,
  canEdit,
  seesAll,
}: {
  readonly officeId: string;
  readonly userId: string;
  readonly branches: readonly OfficeBranch[];
  readonly granted: readonly BranchAccessRow[];
  readonly canEdit: boolean;
  /** Người có quyền duyệt phân quyền (Admin) thấy mọi chi nhánh, không cần cấp. */
  readonly seesAll: boolean;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [action, setAction] = useState<Action>({ kind: 'grant' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const heldIds = new Set(granted.map((g) => g.branchId));
  const available = branches.filter((b) => !heldIds.has(b.id));

  function open(next: Action) {
    setAction(next);
    setError(null);
    dialog.current?.showModal();
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const branchId = action.kind === 'revoke' ? action.branch.id : String(f.get('branch') ?? '');
    setBusy(true);
    setError(null);
    try {
      const r = await postJson('/dms/branch-access', {
        officeId,
        userId,
        branchId,
        granted: action.kind === 'grant',
        reason: String(f.get('reason') ?? '').trim(),
      });
      if (!r.ok) return setError(branchMessage(r.code));
      dialog.current?.close();
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  const title =
    action.kind === 'grant' ? 'Cấp chi nhánh' : `Thu hồi chi nhánh ${action.branch.name}`;

  return (
    <section className="grid gap-3 rounded-2xl bg-surface p-5 shadow-sm" aria-labelledby="cn-t">
      <h2 id="cn-t" className="text-xs font-bold tracking-wide text-muted uppercase">
        Chi nhánh được xem
      </h2>
      {branches.length === 0 ? (
        <p className="muted text-sm">
          Văn phòng chưa có chi nhánh nào nên chưa giới hạn theo chi nhánh.
        </p>
      ) : seesAll ? (
        <p className="text-sm">
          <strong>Mọi chi nhánh</strong> · người có quyền duyệt phân quyền xem toàn văn phòng.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted">
            Chỉ thấy hồ sơ và bản ghi sổ của các chi nhánh dưới đây (hồ sơ tạo trước khi áp dụng,
            chưa gắn chi nhánh, vẫn thấy theo quyền nhóm).
          </p>
          {granted.length === 0 ? (
            <p className="text-sm text-warn">Chưa được cấp chi nhánh nào.</p>
          ) : (
            <ul className="flex flex-wrap gap-2" aria-label="Chi nhánh đã cấp">
              {granted.map((g) => (
                <li key={`${g.source}-${g.branchId}`} className="flex items-center gap-2">
                  <Pill tone="ok">
                    {g.branchName}
                    {g.source === 'LEGACY' ? ' · cấp theo vai cũ' : ''}
                  </Pill>
                  {canEdit && g.source === 'DMS' ? (
                    <button
                      type="button"
                      className="danger-outline"
                      onClick={() =>
                        open({ kind: 'revoke', branch: { id: g.branchId, name: g.branchName } })
                      }
                    >
                      Thu hồi
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canEdit && available.length > 0 ? (
            <div>
              <button type="button" onClick={() => open({ kind: 'grant' })}>
                Cấp chi nhánh
              </button>
            </div>
          ) : null}
        </>
      )}
      <dialog ref={dialog} className="branch-dialog" aria-labelledby={`cn-d-${userId}`}>
        <form className="form" onSubmit={submit}>
          <h2 id={`cn-d-${userId}`}>{title}</h2>
          {action.kind === 'grant' ? (
            <label>
              Chi nhánh
              <select name="branch" required defaultValue="">
                <option value="" disabled>
                  Chọn chi nhánh
                </option>
                {available.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="muted">
              Có hiệu lực ngay: người này không còn thấy hồ sơ và bản ghi của chi nhánh. Không xoá
              gì, lịch sử cấp và thu hồi vẫn còn.
            </p>
          )}
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
              {action.kind === 'grant' ? 'Cấp chi nhánh' : 'Thu hồi'}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
