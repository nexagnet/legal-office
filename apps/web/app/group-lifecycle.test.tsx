import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyGroupButton } from '../components/permissions/CopyGroupButton';
import { GroupStatusButton } from '../components/permissions/GroupStatusButton';
import { GroupsTab } from '../components/permissions/GroupsTab';
import type { DmsGroup, PermissionRequest } from '../lib/permission-model';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  usePathname: () => '/quan-tri/phan-quyen',
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  push.mockClear();
  refresh.mockClear();
});

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const bodyOf = (spy: ReturnType<typeof vi.spyOn>) =>
  JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string) as Record<string, unknown>;

const groups: DmsGroup[] = [
  {
    id: 'g1',
    name: 'Văn thư chi nhánh',
    permissions: ['vtden.read.all'],
    member_ids: ['u1', 'u2'],
    kind: 'CUSTOM',
    status: 'ACTIVE',
    version: 3,
    description: 'Sao chép từ Văn thư',
  },
  {
    id: 'g2',
    name: 'Văn thư',
    permissions: ['vtden.read.all'],
    member_ids: [],
    kind: 'TEMPLATE',
    status: 'ACTIVE',
    version: 2,
  },
  {
    id: 'g3',
    name: 'Kế toán nhiều địa điểm',
    permissions: [],
    member_ids: [],
    kind: 'CUSTOM',
    status: 'RETIRED',
    version: 1,
  },
];
const req = (over: Partial<PermissionRequest>): PermissionRequest => ({
  id: 'abcd1234',
  group_id: 'g1',
  kind: 'GRANT',
  permission: 'vtden.draft.all',
  user_id: null,
  reason: 'x',
  status: 'PENDING',
  proposed_by: 'u9',
  proposed_at: '2026-11-01T01:00:00Z',
  reviewed_by: null,
  reviewed_at: null,
  review_reason: null,
  ...over,
});

const tab = (loc?: string, requests: PermissionRequest[] = []) =>
  render(
    <GroupsTab
      groups={groups}
      requests={requests}
      searchParams={{ loc }}
      canPropose
      officeId="o1"
    />,
  );

describe('GroupsTab (Figma P3)', () => {
  it('đếm Đang dùng, Chờ duyệt, Ngừng dùng và hiện loại, phiên bản, đề xuất v+1', () => {
    tab(undefined, [req({})]);
    expect(screen.getByRole('link', { name: /Đang dùng/ }).textContent).toContain('2');
    expect(screen.getByRole('link', { name: /Chờ duyệt/ }).textContent).toContain('1');
    expect(screen.getByRole('link', { name: /Ngừng dùng/ }).textContent).toContain('1');
    expect(screen.getByText('Mẫu')).toBeTruthy();
    expect(screen.getByText('Tùy chỉnh')).toBeTruthy();
    expect(screen.getByText('v3')).toBeTruthy();
    expect(screen.getByText('Đề xuất v4')).toBeTruthy();
    const table = within(screen.getByRole('table'));
    expect(table.queryByText('Kế toán nhiều địa điểm')).toBeNull();
  });

  it('tab Ngừng dùng chỉ liệt kê nhóm đã ngừng', () => {
    tab('ngung-dung');
    const table = within(screen.getByRole('table'));
    expect(table.getByText('Kế toán nhiều địa điểm')).toBeTruthy();
    expect(table.queryByText('Văn thư chi nhánh')).toBeNull();
    expect(screen.getAllByText('Ngừng dùng').length).toBeGreaterThan(0);
  });

  it('đề xuất thành viên không làm tăng phiên bản đề xuất', () => {
    tab(undefined, [req({ kind: 'ADD_MEMBER', permission: null, user_id: 'u5' })]);
    expect(screen.queryByText(/Đề xuất v/)).toBeNull();
    expect(screen.getByText('1 đề xuất thành viên')).toBeTruthy();
  });
});

describe('CopyGroupButton', () => {
  it('gọi sao chép với nhóm nguồn và tên mới rồi mở nhóm vừa tạo', async () => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'GROUP_CREATED', label: 'gNew' }));
    render(<CopyGroupButton groups={groups.slice(0, 2)} />);
    fireEvent.change(screen.getByLabelText('Nhóm nguồn', { selector: 'select' }), {
      target: { value: 'g2' },
    });
    fireEvent.change(screen.getByLabelText('Tên nhóm mới'), { target: { value: 'Bản sao' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sao chép', hidden: true }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/quan-tri/phan-quyen/nhom/gNew'));
    expect(spy.mock.calls[0]![0]).toBe('/api/dms/groups/g2/copy');
    expect(bodyOf(spy)).toEqual({ name: 'Bản sao' });
  });

  it('báo lỗi tiếng Việt khi trùng tên', async () => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      reply(409, { code: 'GROUP_NAME_IN_USE' }),
    );
    render(<CopyGroupButton groups={groups.slice(0, 1)} />);
    fireEvent.change(screen.getByLabelText('Tên nhóm mới'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sao chép', hidden: true }));
    await waitFor(() =>
      expect(screen.getByRole('alert', { hidden: true }).textContent).toContain('trùng tên'),
    );
    expect(push).not.toHaveBeenCalled();
  });
});

describe('GroupStatusButton', () => {
  it('ngừng dùng gửi RETIRED kèm lý do', async () => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'GROUP_RETIRED', label: 'g1' }));
    render(<GroupStatusButton groupId="g1" retire />);
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'không còn dùng' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Ngừng dùng nhóm', hidden: true })[1]!);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(spy.mock.calls[0]![0]).toBe('/api/dms/groups/g1/status');
    expect(bodyOf(spy)).toEqual({ status: 'RETIRED', reason: 'không còn dùng' });
  });

  it('dùng lại gửi ACTIVE; người cuối cùng giữ quyền duyệt thì báo lỗi', async () => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(409, { code: 'WOULD_REMOVE_LAST_APPROVER' }));
    render(<GroupStatusButton groupId="g3" retire={false} />);
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'cần lại' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Dùng lại nhóm', hidden: true })[1]!);
    await waitFor(() =>
      expect(screen.getByRole('alert', { hidden: true }).textContent).toContain(
        'người duyệt cuối cùng',
      ),
    );
    expect(bodyOf(spy)).toEqual({ status: 'ACTIVE', reason: 'cần lại' });
  });
});
