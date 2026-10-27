'use client';

import { useMemo, useState } from 'react';
import { ROLE_LABEL } from '../lib/messages';
import type { Member } from '../lib/admin-api';

export interface MemberRow extends Member {
  readonly pending: boolean;
}

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

function statusOf(m: MemberRow): string {
  if (!m.role) return m.pending ? 'Chờ duyệt' : 'Chưa có vai';
  return m.hasLogin ? 'Hoạt động' : 'Chưa có tài khoản';
}

/** Danh bạ thành viên có tìm theo tên/email (không dấu) và lọc theo vai trò. */
export function MemberTable({ members }: { readonly members: readonly MemberRow[] }) {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const roles = useMemo(
    () => [...new Set(members.map((m) => m.role).filter((r): r is string => !!r))],
    [members],
  );
  const shown = useMemo(() => {
    const needle = normalize(query.trim());
    return members.filter(
      (m) => (!role || m.role === role) && (!needle || normalize(m.label).includes(needle)),
    );
  }, [members, query, role]);

  return (
    <>
      <div className="admin-toolbar" role="search">
        <label>
          Tìm thành viên
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tên hoặc email"
          />
        </label>
        <label>
          Vai trò
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Tất cả</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r] ?? r}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted" role="status">
        {shown.length}/{members.length} thành viên
      </p>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">Thành viên văn phòng</caption>
          <thead>
            <tr>
              <th scope="col">Thành viên</th>
              <th scope="col">Vai trò</th>
              <th scope="col">Địa điểm</th>
              <th scope="col">Quyền ký</th>
              <th scope="col">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={`${m.userId}-${m.role ?? 'none'}`}>
                <th scope="row">{m.label}</th>
                <td>
                  {m.role ? (
                    (ROLE_LABEL[m.role] ?? m.role)
                  ) : (
                    <span className="muted">Chưa có vai</span>
                  )}
                </td>
                <td>
                  {m.branches.length > 0 ? (
                    m.branches.join(', ')
                  ) : (
                    <span className="muted">Không</span>
                  )}
                </td>
                <td>{m.legalSigner ? 'Có' : '—'}</td>
                <td>{statusOf(m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
