import { DataTable } from '../ui/data-table';
import Link from 'next/link';
import { FilterChips } from '../ui/filter-chips';
import {
  defaultScopeLabel,
  groupVersion,
  isGroupActive,
  isTemplateGroup,
  normalizeText,
  summarizeGroup,
  type DmsGroup,
  type PermissionRequest,
} from '../../lib/permission-model';
import { CopyGroupButton } from './CopyGroupButton';
import { NoteBox, Pill } from './Pill';

type Loc = 'dang-dung' | 'cho-duyet' | 'ngung-dung';

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
}: {
  readonly groups: readonly DmsGroup[];
  readonly requests: readonly PermissionRequest[];
  readonly searchParams: { loc?: string; q?: string };
  readonly canPropose: boolean;
}) {
  const loc: Loc =
    searchParams.loc === 'cho-duyet' || searchParams.loc === 'ngung-dung'
      ? searchParams.loc
      : 'dang-dung';
  const q = normalizeText((searchParams.q ?? '').trim());
  const pendingOf = (id: string, kinds?: readonly string[]) =>
    requests.filter(
      (r) => r.status === 'PENDING' && r.group_id === id && (!kinds || kinds.includes(r.kind)),
    ).length;
  const active = groups.filter(isGroupActive);
  const retired = groups.filter((g) => !isGroupActive(g));
  const waiting = active.filter((g) => pendingOf(g.id) > 0);
  const base = loc === 'cho-duyet' ? waiting : loc === 'ngung-dung' ? retired : active;
  const shown = base.filter((g) => !q || normalizeText(g.name).includes(q));

  const renderRow = (g: DmsGroup) => {
    const pendingPerm = pendingOf(g.id, ['GRANT', 'REVOKE']);
    const pendingMember = pendingOf(g.id, ['ADD_MEMBER', 'REMOVE_MEMBER']);
    const version = groupVersion(g);
    return (
      <tr key={g.id}>
        <th scope="row">
          <span className="grid">
            <span className="person-name">{g.name}</span>
            <span className="person-mail">{g.description ?? summarizeGroup(g)}</span>
          </span>
        </th>
        <td>
          <Pill tone={isTemplateGroup(g) ? 'info' : 'brass'}>
            {isTemplateGroup(g) ? 'Mẫu' : 'Tùy chỉnh'}
          </Pill>
        </td>
        <td>{defaultScopeLabel(g)}</td>
        <td>{g.permissions.length}</td>
        <td>{g.member_ids.length}</td>
        <td>v{version}</td>
        <td>
          <span className="flex flex-wrap gap-1.5">
            {isGroupActive(g) ? (
              <Pill tone="ok">Đang dùng</Pill>
            ) : (
              <Pill tone="mute">Ngừng dùng</Pill>
            )}
            {pendingPerm > 0 ? <Pill tone="brass">Đề xuất v{version + 1}</Pill> : null}
            {pendingMember > 0 ? <Pill tone="warn">{pendingMember} đề xuất thành viên</Pill> : null}
          </span>
        </td>
        <td>
          <Link
            className="link-btn font-semibold whitespace-nowrap"
            href={`/quan-tri/phan-quyen/nhom/${g.id}`}
          >
            {isTemplateGroup(g) ? 'Xem ›' : 'Mở ›'}
          </Link>
        </td>
      </tr>
    );
  };
  const SECTIONS: readonly (readonly [string, readonly DmsGroup[]])[] = [
    ['Nhóm mẫu của hệ thống · được bảo vệ, không sửa trực tiếp', shown.filter(isTemplateGroup)],
    [
      'Nhóm tùy chỉnh của văn phòng · sao chép từ mẫu, sửa cần duyệt',
      shown.filter((g) => !isTemplateGroup(g)),
    ],
  ];

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
            className="!max-w-[160px] !flex-none"
          />
        </form>
        <div className="min-w-0 flex-1">
          <FilterChips
            label="Lọc nhóm quyền"
            active={loc}
            chips={[
              {
                key: 'dang-dung',
                label: 'Đang dùng',
                href: href('dang-dung', q),
                count: active.length,
              },
              {
                key: 'cho-duyet',
                label: 'Chờ duyệt',
                href: href('cho-duyet', q),
                count: waiting.length,
              },
              {
                key: 'ngung-dung',
                label: 'Ngừng dùng',
                href: href('ngung-dung', q),
                count: retired.length,
              },
            ]}
          />
        </div>
        {canPropose ? (
          <div className="ml-auto flex gap-3">
            <CopyGroupButton groups={active} />
            <Link className="primary btn-link" href="/quan-tri/phan-quyen/nhom/tao">
              + Tạo nhóm quyền
            </Link>
          </div>
        ) : null}
      </div>
      <DataTable tableKey="permissions-GroupsTab-1" className="member-card">
        <table>
          <caption className="sr-only">Nhóm quyền</caption>
          <thead>
            <tr>
              <th scope="col">Nhóm quyền</th>
              <th scope="col">Loại</th>
              <th scope="col">Phạm vi mặc định</th>
              <th scope="col">Số quyền</th>
              <th scope="col">Người dùng</th>
              <th scope="col">Phiên bản</th>
              <th scope="col">Trạng thái</th>
              <th scope="col">
                <span className="sr-only">Mở</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  Chưa có nhóm quyền nào.
                </td>
              </tr>
            ) : (
              SECTIONS.flatMap(([title, rows]) =>
                rows.length === 0
                  ? []
                  : [
                      <tr key={`h-${title}`} className="section-row">
                        <th scope="colgroup" colSpan={8}>
                          {title}
                        </th>
                      </tr>,
                      ...rows.map(renderRow),
                    ],
              )
            )}
          </tbody>
        </table>
      </DataTable>
      <NoteBox tone="warn" title="Quyền quản trị phân quyền do Admin giữ">
        Quyền duyệt thay đổi quyền và duyệt yêu cầu sửa đổi hồ sơ gắn với Admin; người đề xuất không
        tự duyệt đề xuất của mình. Tư cách hành nghề không phải là quyền: không nhóm nào cấp được.
        Nhóm mới tạo là nhóm trống; thêm quyền và thành viên bằng đề xuất ở trang chi tiết nhóm.
      </NoteBox>
    </>
  );
}
