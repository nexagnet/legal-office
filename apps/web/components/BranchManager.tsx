'use client';

import { DataTable } from './ui/data-table';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';
import type { Branch } from '../app/session';
import { NoteBox, Pill } from './permissions/Pill';

function BranchRow({
  officeId,
  branch,
  memberCount,
  groups,
}: {
  readonly officeId: string;
  readonly branch: Branch;
  readonly memberCount: number;
  readonly groups: readonly string[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/branches/${branch.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ officeId, name }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setError(messageFor(json.code));
      setNotice('Đã lưu.');
      setEditing(false);
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <th scope="row">
        {editing ? (
          <form className="branch-edit" onSubmit={submit}>
            <input
              name="name"
              aria-label={`Tên địa điểm ${branch.name}`}
              defaultValue={branch.name}
              required
              maxLength={100}
              autoFocus
            />
            {error ? <span role="alert">{error}</span> : null}
            <span className="branch-actions">
              <button type="button" onClick={() => setEditing(false)}>
                Hủy
              </button>
              <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
                {busy ? 'Đang lưu…' : 'Lưu tên mới'}
              </button>
            </span>
          </form>
        ) : (
          <span className="grid">
            <strong className="branch-name">{branch.name}</strong>
            {notice ? <span role="status">{notice}</span> : null}
          </span>
        )}
      </th>
      <td>{memberCount} người</td>
      <td>
        {groups.length === 0 ? (
          '—'
        ) : (
          <span className="flex flex-wrap gap-1.5">
            {groups.map((g) => (
              <Pill key={g} tone="brass">
                {g}
              </Pill>
            ))}
          </span>
        )}
      </td>
      <td>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button type="button" className="link-btn font-semibold" onClick={() => setEditing(true)}>
            Đổi tên
          </button>
          <Link
            className="link-btn font-semibold"
            href={`/quan-tri/phan-quyen?dd=${encodeURIComponent(branch.name)}`}
          >
            Xem người được cấp ›
          </Link>
        </span>
      </td>
    </tr>
  );
}

/** Admin thêm / đổi tên địa điểm hoạt động (chi nhánh) của văn phòng. Không xoá: hồ sơ và sổ tham chiếu chi nhánh. */
export function BranchManager({
  officeId,
  branches,
  memberCounts = {},
  branchGroups = {},
}: {
  readonly officeId: string;
  readonly branches: readonly Branch[];
  readonly memberCounts?: Readonly<Record<string, number>>;
  /** Tên các nhóm quyền đang áp dụng tại từng địa điểm (theo thành viên được cấp địa điểm đó). */
  readonly branchGroups?: Readonly<Record<string, readonly string[]>>;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get('name') ?? '').trim();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/branches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ officeId, name }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setError(messageFor(json.code));
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
    <section aria-labelledby="branch-t">
      <div className="member-bar">
        <h1 id="branch-t" className="bar-title">
          {branches.length} địa điểm
        </h1>
        <button
          type="button"
          className="primary"
          onClick={() => {
            setError(null);
            dialog.current?.showModal();
          }}
        >
          + Thêm địa điểm
        </button>
      </div>
      <DataTable tableKey="BranchManager-1" className="member-card">
        <table>
          <caption className="sr-only">Địa điểm hoạt động</caption>
          <thead>
            <tr>
              <th scope="col">Địa điểm</th>
              <th scope="col">Người được cấp</th>
              <th scope="col">Nhóm đang áp dụng tại đây</th>
              <th scope="col">
                <span className="sr-only">Thao tác</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <BranchRow
                key={`${b.id}-${b.name}`}
                officeId={officeId}
                branch={b}
                memberCount={memberCounts[b.name] ?? 0}
                groups={branchGroups[b.name] ?? []}
              />
            ))}
          </tbody>
        </table>
      </DataTable>
      <NoteBox tone="warn" title="Địa điểm không phải là quyền">
        Cấp hoặc thu hồi địa điểm cho một người là việc phân quyền, không phải đổi tên địa điểm. Đổi
        tên hoặc thêm địa điểm có hiệu lực ngay, được ghi nhật ký và không tự cấp quyền cho ai.
      </NoteBox>
      <dialog ref={dialog} className="branch-dialog" aria-labelledby="branch-add-t">
        <form className="form" onSubmit={add}>
          <h2 id="branch-add-t">Thêm địa điểm</h2>
          <p className="muted">
            Địa điểm mới xuất hiện ngay trong danh sách chọn khi cấp quyền và lập hồ sơ.
          </p>
          <label>
            Tên địa điểm
            <input name="name" required maxLength={100} autoComplete="off" />
          </label>
          <p className="muted">Không trùng tên địa điểm đã có (không phân biệt hoa thường).</p>
          <p role="alert" className="error" hidden={!error}>
            {error}
          </p>
          <div className="admin-toolbar">
            <button type="button" onClick={() => dialog.current?.close()}>
              Hủy
            </button>
            <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
              Thêm địa điểm
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
