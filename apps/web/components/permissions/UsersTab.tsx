import { DataTable } from '../ui/data-table';
import Link from 'next/link';
import { Avatar } from '../ui/avatar';
import { FilterChips } from '../ui/filter-chips';
import { ROLE_LABEL } from '../../lib/messages';
import {
  ACCOUNT_STATE_LABEL,
  accountState,
  buildPersonRows,
  normalizeText,
  type AccountState,
  type DmsGroup,
  type PermissionRequest,
  type PersonRow,
} from '../../lib/permission-model';
import type { Member } from '../../lib/admin-api';
import { NoteBox, Pill, type PillTone } from './Pill';

const PAGE_SIZE = 10;
const STATE_TONE: Record<AccountState, PillTone> = {
  active: 'ok',
  'no-access': 'warn',
  waiting: 'brass',
  suspended: 'danger',
};

type Loc = 'tat-ca' | 'cho-duyet' | 'chua-co-quyen' | 'tam-khoa';

const isLoc = (v: string | undefined): v is Loc =>
  v === 'cho-duyet' || v === 'chua-co-quyen' || v === 'tam-khoa';

export function personMatches(p: PersonRow, loc: Loc, q: string, place = ''): boolean {
  if (place && !p.isAdmin && !p.branches.includes(place)) return false;
  if (loc === 'cho-duyet' && p.pending.length === 0) return false;
  if (loc === 'chua-co-quyen' && accountState(p) !== 'no-access' && accountState(p) !== 'waiting')
    return false;
  if (loc === 'tam-khoa' && !p.suspended) return false;
  return !q || normalizeText(p.label).includes(q);
}

const href = (loc: Loc, q: string, page: number, place = '') => {
  const p = new URLSearchParams();
  if (place) p.set('dd', place);
  if (loc !== 'tat-ca') p.set('loc', loc);
  if (q) p.set('q', q);
  if (page > 1) p.set('page', String(page));
  const s = p.toString();
  return `/quan-tri/phan-quyen${s ? `?${s}` : ''}`;
};

/** Tab "Người dùng & quyền hiệu lực" (Figma P1). Quyền hiệu lực của một người xem ở trang riêng. */
export function UsersTab({
  members,
  groups,
  requests,
  searchParams,
  canPropose,
}: {
  readonly members: readonly Member[];
  readonly groups: readonly DmsGroup[];
  readonly requests: readonly PermissionRequest[];
  readonly searchParams: { loc?: string; q?: string; page?: string; dd?: string };
  readonly canPropose: boolean;
}) {
  const people = buildPersonRows(members, groups, requests);
  const loc: Loc = isLoc(searchParams.loc) ? searchParams.loc : 'tat-ca';
  const q = normalizeText((searchParams.q ?? '').trim());
  const place = searchParams.dd ?? '';
  const filtered = people.filter((p) => personMatches(p, loc, q, place));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(searchParams.page) || 1));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const count = (l: Loc) => people.filter((p) => personMatches(p, l, '', place)).length;

  return (
    <>
      <div className="member-bar">
        <form className="contents" role="search" action="/quan-tri/phan-quyen">
          {loc === 'tat-ca' ? null : <input type="hidden" name="loc" value={loc} />}
          {place ? <input type="hidden" name="dd" value={place} /> : null}
          <input
            type="search"
            name="q"
            aria-label="Tìm thành viên"
            defaultValue={searchParams.q ?? ''}
            placeholder="Tìm thành viên…"
            className="!max-w-[220px] !flex-none"
          />
        </form>
        <div className="flex-1">
          <FilterChips
            label="Lọc thành viên"
            active={loc}
            chips={[
              {
                key: 'tat-ca',
                label: 'Tất cả',
                href: href('tat-ca', q, 1, place),
                count: count('tat-ca'),
              },
              {
                key: 'cho-duyet',
                label: 'Chờ duyệt',
                href: href('cho-duyet', q, 1, place),
                count: count('cho-duyet'),
              },
              {
                key: 'chua-co-quyen',
                label: 'Chưa có quyền',
                href: href('chua-co-quyen', q, 1, place),
                count: count('chua-co-quyen'),
              },
              {
                key: 'tam-khoa',
                label: 'Tạm khóa',
                href: href('tam-khoa', q, 1, place),
                count: count('tam-khoa'),
              },
            ]}
          />
        </div>
        {canPropose ? (
          <Link className="primary btn-link" href="/quan-tri/phan-quyen/de-xuat?loai=ADD_MEMBER">
            Gán nhóm quyền
          </Link>
        ) : null}
      </div>
      {place ? (
        <p className="text-sm text-muted">
          Đang lọc theo địa điểm <strong>{place}</strong> ·{' '}
          <Link href={href(loc, q, 1)}>Bỏ lọc</Link>
        </p>
      ) : null}
      <DataTable tableKey="permissions-UsersTab-1" className="member-card">
        <table>
          <caption className="sr-only">Người dùng và quyền hiệu lực</caption>
          <thead>
            <tr>
              <th scope="col">Thành viên</th>
              <th scope="col">Nhóm quyền</th>
              <th scope="col">Phạm vi</th>
              <th scope="col">Tài khoản</th>
              <th scope="col">Yêu cầu</th>
              <th scope="col">
                <span className="sr-only">Xem</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  Không có thành viên nào khớp.
                </td>
              </tr>
            ) : (
              shown.map((p) => <UserRow key={p.userId} p={p} />)
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between gap-3 pt-4 text-sm text-muted">
          <span>
            Hiển thị {shown.length} / {filtered.length} thành viên · Trang {page} / {pages}
          </span>
          <span className="flex gap-2">
            {page > 1 ? (
              <Link className="chip" href={href(loc, q, page - 1, place)}>
                ‹ Trước
              </Link>
            ) : null}
            {page < pages ? (
              <Link className="chip" href={href(loc, q, page + 1, place)}>
                Sau ›
              </Link>
            ) : null}
          </span>
        </div>
      </DataTable>
      <NoteBox title="Cách đọc quyền hiệu lực">
        Nhóm quyền cho biết phần mềm cho phép những hành động nào. Một người có thể thuộc nhiều
        nhóm; quyền hiệu lực là tập hợp quyền của từng nhóm. Admin mặc nhiên có toàn quyền quản trị
        nhưng vẫn không xóa, không ghi đè, không sửa trực tiếp hồ sơ đã lưu. Tư cách hành nghề Thừa
        hành viên quản lý riêng ở Thẻ THV, không đến từ nhóm quyền.
      </NoteBox>
    </>
  );
}

function UserRow({ p }: { readonly p: PersonRow }) {
  const st = accountState(p);
  const pending = p.pending[0];
  return (
    <tr>
      <th scope="row" className="min-w-[240px]">
        <span className="person">
          <Avatar
            name={p.name}
            id={p.userId}
            size="lg"
            className={st === 'active' ? undefined : 'opacity-60'}
          />
          <span className="grid">
            <span className="person-name">{p.name}</span>
            {p.email ? <span className="person-mail">{p.email}</span> : null}
          </span>
        </span>
      </th>
      <td>
        {p.suspended ? (
          <span className="grid">
            <span>Không còn quyền hiệu lực</span>
            <span className="person-mail">Nhóm và lịch sử giữ nguyên</span>
          </span>
        ) : p.groups.length > 0 ? (
          <span className="grid">
            <span>{p.groups.map((g) => g.name).join(' + ')}</span>
          </span>
        ) : p.isAdmin ? (
          <span className="grid">
            <span>Admin (mặc nhiên)</span>
            <span className="person-mail">Toàn quyền quản trị</span>
          </span>
        ) : (
          <span className="grid">
            <span>Chưa có nhóm</span>
            {p.legacyRole ? (
              <span className="person-mail">
                Vai cũ: {ROLE_LABEL[p.legacyRole] ?? p.legacyRole}
              </span>
            ) : null}
          </span>
        )}
      </td>
      <td>{p.isAdmin ? 'Toàn văn phòng' : p.branches.length > 0 ? p.branches.join(', ') : '—'}</td>
      <td>
        <Pill tone={STATE_TONE[st]}>{ACCOUNT_STATE_LABEL[st]}</Pill>
      </td>
      <td>
        {pending ? (
          <Pill tone="warn">
            {pending.kind === 'ADD_MEMBER' ? 'Chờ: gán nhóm' : 'Chờ: gỡ nhóm'}
          </Pill>
        ) : (
          '—'
        )}
      </td>
      <td>
        <Link
          className="link-btn font-semibold whitespace-nowrap"
          href={`/quan-tri/phan-quyen/nguoi-dung/${p.userId}`}
        >
          Xem ›
        </Link>
      </td>
    </tr>
  );
}
