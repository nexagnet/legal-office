'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ACCESS_KIND_LABEL, ROLE_LABEL, messageFor } from '../lib/messages';
import type { Branch } from '../app/session';
import { CheckPanel } from './CheckPanel';

export interface Person {
  readonly userId: string;
  readonly label: string;
}

/** Admin đề xuất cấp/đổi quyền. Chưa có hiệu lực cho đến khi Trưởng văn phòng (khác người) duyệt. */
export function AccessRequestForm({
  officeId,
  people,
  branches,
}: {
  readonly officeId: string;
  readonly people: readonly Person[];
  readonly branches: readonly Branch[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState('GRANT_ROLE');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const detail =
      kind === 'GRANT_ROLE' || kind === 'REVOKE_ROLE'
        ? { role: String(f.get('role')) }
        : kind === 'SET_LEGAL_SIGNER'
          ? { flag: f.get('flag') === 'true' }
          : { branchId: String(f.get('branchId')) };
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch('/api/admin/access-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          officeId,
          targetUserId: String(f.get('targetUserId')),
          kind,
          reason: String(f.get('reason') ?? '').trim(),
          ...detail,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setError(messageFor(json.code));
      form.reset();
      setKind('GRANT_ROLE');
      setDone(true);
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  if (people.length === 0) return null;
  return (
    <form className="panels assign-grid" onSubmit={submit} aria-labelledby="access-t">
      <section className="panel form">
        <h2 id="access-t">Đề xuất cấp quyền</h2>
        <p className="muted">Đề xuất chỉ có hiệu lực sau khi Trưởng văn phòng duyệt.</p>
        <label>
          Thành viên
          <select name="targetUserId" required defaultValue={people[0]?.userId}>
            {people.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Nội dung
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(ACCESS_KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {kind === 'GRANT_ROLE' || kind === 'REVOKE_ROLE' ? (
          <label>
            Vai trò
            <select name="role" required defaultValue="THU_KY">
              {Object.entries(ROLE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {kind === 'SET_LEGAL_SIGNER' ? (
          <label>
            Quyền ký pháp lý
            <select name="flag" defaultValue="true">
              <option value="true">Cấp</option>
              <option value="false">Thu hồi</option>
            </select>
          </label>
        ) : null}
        {kind === 'GRANT_BRANCH' || kind === 'REVOKE_BRANCH' ? (
          <label>
            Chi nhánh
            <select name="branchId" required defaultValue={branches[0]?.id}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          Lý do
          <input name="reason" required maxLength={1000} />
        </label>
      </section>
      <CheckPanel
        notice="Hệ thống kiểm tra điều kiện và quyền trước khi cho phép thao tác."
        note="Lưu dấu thời gian • người thực hiện • bằng chứng • trạng thái."
        title="Ma trận quyền cần giữ"
        checks={[
          'Admin quản trị toàn bộ, chỉ Admin phân THV',
          'THV xem mọi chi nhánh, chỉ xử lý hồ sơ được giao',
          'Thư ký xem/xử lý mọi hồ sơ',
          'Văn thư có thể quản lý nhiều chi nhánh',
          'Kế toán chỉ xác nhận MISA trong phạm vi cấu hình',
        ]}
      >
        <p role="alert" className="error" hidden={!error}>
          {error}
        </p>
        <p role="status" className="success" hidden={!done}>
          Đã gửi đề xuất, chờ Trưởng văn phòng duyệt.
        </p>
        <button type="submit" className="primary wide" disabled={busy} aria-busy={busy}>
          Gửi đề xuất
        </button>
      </CheckPanel>
    </form>
  );
}
