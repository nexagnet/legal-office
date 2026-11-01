import Link from 'next/link';
import { FilterChips } from '../ui/filter-chips';
import {
  normalizeText,
  summarizeGroup,
  type DmsGroup,
  type PermissionRequest,
} from '../../lib/permission-model';
import { CreateGroupButton } from './CreateGroupButton';
import { NoteBox, Pill } from './Pill';

type Loc = 'dang-dung' | 'cho-duyet';

const href = (loc: Loc, q: string) => {
  const p = new URLSearchParams({ tab: 'nhom' });
  if (loc !== 'dang-dung') p.set('loc', loc);
  if (q) p.set('q', q);
  return `/quan-tri/phan-quyen?${p}`;
};

/** Tab "Nhóm quyền" (Figma P3). Nhóm rỗng vô hại: quyền và thành viên chỉ vào nhóm qua đề xuất có duyệt. */
export function GroupsTab({
  groups,
  requests,
  searchParams,
  canPropose,
  officeId,
}: {
  readonly groups: readonly DmsGroup[];
  readonly requests: readonly PermissionRequest[];
  readonly searchParams: { loc?: string; q?: string };
  readonly canPropose: boolean;
  readonly officeId: string;
}) {
  const loc: Loc = searchParams.loc === 'cho-duyet' ? 'cho-duyet' : 'dang-dung';
  const q = normalizeText((searchParams.q ?? '').trim());
  const pendingOf = (id: string) =>
    requests.filter((r) => r.status === 'PENDING' && r.group_id === id).length;
  const waiting = groups.filter((g) => pendingOf(g.id) > 0);
  const base = loc === 'cho-duyet' ? waiting : groups;
  const shown = base.filter((g) => !q || normalizeText(g.name).includes(q));

  return (
    <>
      <div className="member-bar">
        <form className="contents" role="search" action="/quan-tri/phan-quyen">
          <input type="hidden" name="tab" value="nhom" />
          {loc === 'dang-dung' ? null : <input type="hidden" name="loc" value={loc} />}
          <input
            type="search"
            name="q"
            aria-label="Tìm nhóm"
            defaultValue={searchParams.q ?? ''}
            placeholder="Tìm nhóm…"
            className="!max-w-[220px] !flex-none"
          />
        </form>
        <div className="flex-1">
          <FilterChips
            label="Lọc nhóm quyền"
            active={loc}
            chips={[
              {
                key: 'dang-dung',
                label: 'Đang dùng',
                href: href('dang-dung', q),
                count: groups.length,
              },
              {
                key: 'cho-duyet',
                label: 'Chờ duyệt',
                href: href('cho-duyet', q),
                count: waiting.length,
              },
            ]}
          />
        </div>
        {canPropose ? <CreateGroupButton officeId={officeId} /> : null}
      </div>
      <div className="table-wrap member-card">
        <table>
          <caption className="sr-only">Nhóm quyền</caption>
          <thead>
            <tr>
              <th scope="col">Nhóm quyền</th>
              <th scope="col">Số quyền</th>
              <th scope="col">Người dùng</th>
              <th scope="col">Trạng thái</th>
              <th scope="col">
                <span className="sr-only">Mở</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  Chưa có nhóm quyền nào.
                </td>
              </tr>
            ) : (
              shown.map((g) => {
                const pending = pendingOf(g.id);
                return (
                  <tr key={g.id}>
                    <th scope="row">
                      <span className="grid">
                        <span className="person-name">{g.name}</span>
                        <span className="person-mail">{summarizeGroup(g)}</span>
                      </span>
                    </th>
                    <td>{g.permissions.length}</td>
                    <td>{g.member_ids.length}</td>
                    <td>
                      <span className="flex flex-wrap gap-1.5">
                        <Pill tone="ok">Đang dùng</Pill>
                        {pending > 0 ? <Pill tone="warn">{pending} đề xuất chờ duyệt</Pill> : null}
                      </span>
                    </td>
                    <td>
                      <Link
                        className="link-btn font-semibold"
                        href={`/quan-tri/phan-quyen/nhom/${g.id}`}
                      >
                        Mở ›
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <NoteBox tone="warn" title="Quyền quản trị phân quyền do Admin giữ">
        Quyền duyệt thay đổi quyền và duyệt yêu cầu sửa đổi hồ sơ gắn với Admin; người đề xuất không
        tự duyệt đề xuất của mình. Tư cách hành nghề không phải là quyền: không nhóm nào cấp được.
        Nhóm mới tạo là nhóm trống; thêm quyền và thành viên bằng đề xuất ở trang chi tiết nhóm.
      </NoteBox>
    </>
  );
}
