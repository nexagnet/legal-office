'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';
import type { Branch } from '../app/session';

function BranchRow({
  officeId,
  branch,
  memberCount,
}: {
  readonly officeId: string;
  readonly branch: Branch;
  readonly memberCount: number;
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
    <li className="branch-card">
      <span className="branch-icon" aria-hidden="true">
        ◎
      </span>
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
          <span className="branch-meta">{memberCount} thành viên được cấp</span>
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
        <>
          <div className="branch-info">
            <strong className="branch-name">{branch.name}</strong>
            <span className="branch-meta">{memberCount} thành viên được cấp</span>
            {notice ? <span role="status">{notice}</span> : null}
          </div>
          <button type="button" onClick={() => setEditing(true)}>
            Đổi tên
          </button>
        </>
      )}
    </li>
  );
}

/** Admin thêm / đổi tên địa điểm hoạt động (chi nhánh) của văn phòng. Không xoá: hồ sơ và sổ tham chiếu chi nhánh. */
export function BranchManager({
  officeId,
  branches,
  memberCounts = {},
}: {
  readonly officeId: string;
  readonly branches: readonly Branch[];
  readonly memberCounts?: Readonly<Record<string, number>>;
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
      <ul className="plain-list">
        {branches.map((b) => (
          <BranchRow
            key={`${b.id}-${b.name}`}
            officeId={officeId}
            branch={b}
            memberCount={memberCounts[b.name] ?? 0}
          />
        ))}
      </ul>
      <p className="callout">
        <strong>Cấp địa điểm cho Văn thư và Kế toán</strong>
        Làm ở mục Phân quyền và đề xuất (cần Trưởng văn phòng duyệt). Thêm hoặc đổi tên địa điểm có
        hiệu lực ngay và được ghi nhật ký.
      </p>
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
