'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { ROLE_LABEL } from '../lib/messages';
import type { Member } from '../lib/admin-api';
import { Avatar } from './ui/avatar';

export interface MemberRow extends Member {
  readonly pending: boolean;
}

type Filter = 'all' | 'pending' | 'norole';

const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** "Tên (email)" → { name, email }. Nhãn do API ghép sẵn nên tách lại để hiển thị hai dòng. */
function splitLabel(label: string): { name: string; email: string | null } {
  const m = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(label);
  const name = m?.[1];
  const email = m?.[2];
  return name && email ? { name, email } : { name: email ?? label, email: null };
}

function statusOf(m: MemberRow): { label: string; tone: 'ok' | 'warn' | 'idle' } {
  if (!m.role)
    return m.pending
      ? { label: 'Chờ duyệt', tone: 'warn' }
      : { label: 'Chưa có vai', tone: 'idle' };
  return m.hasLogin
    ? { label: 'Hoạt động', tone: 'ok' }
    : { label: 'Chưa có tài khoản', tone: 'idle' };
}

/** Danh bạ thành viên: tìm theo tên/email (không dấu) và lọc theo trạng thái (Figma N11 · Q1). */
export function MemberTable({
  members,
  action,
}: {
  readonly members: readonly MemberRow[];
  readonly action?: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const counts = useMemo(
    () => ({
      all: members.length,
      pending: members.filter((m) => !m.role && m.pending).length,
      norole: members.filter((m) => !m.role).length,
    }),
    [members],
  );
  const shown = useMemo(() => {
    const needle = normalize(query.trim());
    return members.filter(
      (m) =>
        (filter === 'all' || (filter === 'pending' ? !m.role && m.pending : !m.role)) &&
        (!needle || normalize(m.label).includes(needle)),
    );
  }, [members, query, filter]);
  const chips: readonly [Filter, string][] = [
    ['all', 'Tất cả'],
    ['pending', 'Chờ duyệt'],
    ['norole', 'Chưa có vai'],
  ];

  return (
    <>
      <div className="member-bar" role="search">
        <input
          type="search"
          aria-label="Tìm thành viên"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm theo tên hoặc email…"
        />
        <div className="chip-row" role="group" aria-label="Lọc theo trạng thái">
          {chips.map(([k, label]) => (
            <button
              key={k}
              type="button"
              className="chip"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
            >
              {label} {counts[k]}
            </button>
          ))}
        </div>
        {action}
      </div>
      <p className="sr-only" role="status">
        {shown.length}/{members.length} thành viên
      </p>
      <div className="table-wrap member-card">
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
            {shown.map((m) => {
              const { name, email } = splitLabel(m.label);
              const st = statusOf(m);
              return (
                <tr key={`${m.userId}-${m.role ?? 'none'}`}>
                  <th scope="row">
                    <span className="person">
                      <Avatar
                        name={name}
                        id={m.userId}
                        size="lg"
                        className={m.role ? undefined : 'opacity-50'}
                      />
                      <span>
                        <span className="person-name">{name}</span>
                        {email ? <span className="person-mail">{email}</span> : null}
                      </span>
                    </span>
                  </th>
                  <td>
                    {m.role ? (
                      <span className="role-pill" data-role={m.role}>
                        {ROLE_LABEL[m.role] ?? m.role}
                      </span>
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
                  <td>{m.legalSigner ? <strong className="ok-text">Có</strong> : '—'}</td>
                  <td>
                    <span className="state-pill" data-tone={st.tone}>
                      {st.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function AddMemberLink() {
  return (
    <Link className="primary btn-link" href="/quan-tri/nhan-su/them">
      + Thêm thành viên
    </Link>
  );
}
