'use client';

import { DataTable } from './ui/data-table';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { ROLE_LABEL } from '../lib/messages';
import {
  ACCOUNT_STATE_LABEL,
  normalizeText,
  type AccountState,
  type MemberRow,
} from '../lib/permission-model';
import { CaseActionDialog } from './CaseActionDialog';
import { MemberNameForm } from './MemberNameForm';
import { NoteBox, Pill, type PillTone } from './permissions/Pill';
import { Avatar } from './ui/avatar';

export type { MemberRow } from '../lib/permission-model';

type Filter = 'all' | 'pending' | 'norole' | 'suspended';

const STATE_TONE: Record<AccountState, PillTone> = {
  active: 'ok',
  'no-access': 'warn',
  waiting: 'brass',
  suspended: 'danger',
};

/**
 * Danh bạ thành viên (Figma N11 · Q1): tên, email, địa điểm làm việc là dữ liệu nhân sự. Quyền truy cập ứng dụng
 * nằm ở mục Phân quyền, nên bảng này chỉ cho biết nhóm quyền của từng người và dẫn sang "Xem quyền hiệu lực".
 */
export function MemberTable({
  members,
  action,
  officeId,
}: {
  readonly members: readonly MemberRow[];
  readonly action?: ReactNode;
  /** Có mã văn phòng thì Admin sửa được họ tên từng người. */
  readonly officeId?: string;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const match = (m: MemberRow, f: Filter) =>
    f === 'all' ||
    (f === 'pending'
      ? m.pending
      : f === 'suspended'
        ? m.suspended
        : m.state === 'no-access' || m.state === 'waiting');
  const counts = useMemo(
    () => ({
      all: members.length,
      pending: members.filter((m) => match(m, 'pending')).length,
      norole: members.filter((m) => match(m, 'norole')).length,
      suspended: members.filter((m) => match(m, 'suspended')).length,
    }),
    [members],
  );
  const shown = useMemo(() => {
    const needle = normalizeText(query.trim());
    return members.filter(
      (m) =>
        match(m, filter) &&
        (!needle || normalizeText(`${m.name} ${m.email ?? ''}`).includes(needle)),
    );
  }, [members, query, filter]);
  const chips: readonly [Filter, string][] = [
    ['all', 'Tất cả'],
    ['pending', 'Chờ duyệt'],
    ['norole', 'Chưa có quyền'],
    ['suspended', 'Tạm khóa'],
  ];

  return (
    <>
      <div className="member-bar" role="search">
        <input
          type="search"
          aria-label="Tìm thành viên"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm thành viên…"
          className="!max-w-[220px] !flex-none"
        />
        <div className="chip-row flex-1" role="group" aria-label="Lọc theo trạng thái">
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
      <DataTable tableKey="MemberTable-1" className="member-card">
        <table>
          <caption className="sr-only">Thành viên văn phòng</caption>
          <thead>
            <tr>
              <th scope="col">Thành viên</th>
              <th scope="col">Địa điểm làm việc</th>
              <th scope="col">Tài khoản</th>
              <th scope="col">Nhóm quyền</th>
              <th scope="col">
                <span className="sr-only">Quyền hiệu lực</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.userId}>
                <th scope="row" className="min-w-[260px]">
                  <span className="person w-full">
                    <Avatar
                      name={m.name}
                      id={m.userId}
                      size="lg"
                      className={m.state === 'active' ? undefined : 'opacity-60'}
                    />
                    <span className="grid min-w-0 flex-1">
                      <span className="person-name">{m.name}</span>
                      {m.email ? <span className="person-mail">{m.email}</span> : null}
                    </span>
                    {officeId ? (
                      <CaseActionDialog
                        label="Sửa tên"
                        title="Sửa họ tên hiển thị"
                        description={m.email ?? undefined}
                        className="link-btn ml-auto shrink-0 whitespace-nowrap text-[13px] font-semibold"
                      >
                        <MemberNameForm
                          userId={m.userId}
                          officeId={officeId}
                          currentName={m.name}
                        />
                      </CaseActionDialog>
                    ) : null}
                  </span>
                </th>
                <td>
                  {m.isAdmin
                    ? 'Toàn văn phòng'
                    : m.branches.length > 0
                      ? m.branches.join(', ')
                      : '—'}
                </td>
                <td>
                  <Pill tone={STATE_TONE[m.state]}>{ACCOUNT_STATE_LABEL[m.state]}</Pill>
                </td>
                <td>
                  {m.suspended ? (
                    <span className="grid">
                      <span>Không còn quyền hiệu lực</span>
                      <span className="person-mail">Đã tạm khóa, lịch sử giữ nguyên</span>
                    </span>
                  ) : m.groupNames.length > 0 ? (
                    m.groupNames.join(' + ')
                  ) : m.isAdmin ? (
                    'Admin (mặc nhiên)'
                  ) : (
                    <span className="grid">
                      <span>Chưa có nhóm</span>
                      {m.legacyRole ? (
                        <span className="person-mail">
                          Vai cũ: {ROLE_LABEL[m.legacyRole] ?? m.legacyRole}
                        </span>
                      ) : null}
                    </span>
                  )}
                </td>
                <td>
                  <Link
                    className="link-btn font-semibold whitespace-nowrap"
                    href={`/quan-tri/phan-quyen/nguoi-dung/${m.userId}`}
                  >
                    Xem quyền hiệu lực ›
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataTable>
      <NoteBox title="Không còn cột “Quyền ký”">
        Một người có thể thuộc nhiều nhóm quyền; quyền hiệu lực là tập hợp quyền của từng nhóm, giữ
        đúng phạm vi. Việc ký pháp lý không đến từ nhóm quyền: tư cách hành nghề quản lý riêng ở mục
        Thẻ THV.
      </NoteBox>
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
