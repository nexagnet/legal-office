import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddMemberForm } from '../components/AddMemberForm';
import { AdminNav } from '../components/AdminNav';
import { BranchManager } from '../components/BranchManager';
import { describeRequest } from '../lib/admin-describe';

const refresh = vi.fn();
let pushSpy = vi.fn();
let pathname = '/quan-tri/nhan-su';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: (u: string) => pushSpy(u), refresh }),
  usePathname: () => pathname,
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
  refresh.mockClear();
});

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const branches = [{ id: 'b1', name: 'Bắc Ninh', officeId: 'o1' }] as never;
const bodyOf = (spy: ReturnType<typeof vi.spyOn>, i = 0) =>
  JSON.parse((spy.mock.calls[i]![1] as RequestInit).body as string) as Record<string, unknown>;

describe('AdminNav', () => {
  it('marks the current section and shows the pending badge', () => {
    pathname = '/quan-tri/phan-quyen/de-xuat';
    render(
      <AdminNav
        sections={[
          { href: '/quan-tri/nhan-su', label: 'Nhân sự' },
          { href: '/quan-tri/phan-quyen', label: 'Phân quyền', badge: 3 },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: /Phân quyền/ }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: 'Nhân sự' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByText('3')).toBeTruthy();
  });
});

const groups = [
  {
    id: 'g1',
    name: 'Văn thư chi nhánh',
    permissions: ['vtden.read.own', 'vtden.draft.own'],
    member_ids: [],
  },
  { id: 'g2', name: 'Thư ký', permissions: ['vibang.download.all'], member_ids: [] },
  { id: 'g3', name: 'Rỗng', permissions: [], member_ids: [] },
];

describe('AddMemberForm', () => {
  const fill = () => {
    fireEvent.change(screen.getByLabelText('Họ và tên'), { target: { value: 'Hoàng An Nhiên' } });
    fireEvent.change(screen.getByLabelText(/Email đăng nhập/), {
      target: { value: 'nhien@example.test' },
    });
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'nhân sự mới' } });
  };
  const submit = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản và áp dụng quyền' }));

  it('sends the chosen permission groups, no role, and opens the new person', async () => {
    const push = vi.fn();
    pushSpy = push;
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED', label: 'u9' }));
    render(<AddMemberForm officeId="o1" groups={groups} />);
    fill();
    fireEvent.click(screen.getByLabelText(/Văn thư chi nhánh/));
    submit();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/quan-tri/phan-quyen/nguoi-dung/u9'));
    expect(spy.mock.calls[0]![0]).toBe('/api/admin/members');
    expect(bodyOf(spy)).toEqual({
      officeId: 'o1',
      email: 'nhien@example.test',
      fullName: 'Hoàng An Nhiên',
      groupIds: ['g1'],
      reason: 'nhân sự mới',
    });
  });

  it('previews the merged permissions and flags sensitive or wide scope', () => {
    render(<AddMemberForm officeId="o1" groups={groups} />);
    expect(screen.getByText(/Chưa chọn nhóm nào/)).toBeTruthy();
    expect(screen.getByText('Quyền nhạy cảm: không')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Văn thư chi nhánh/));
    expect(screen.getByText(/2 quyền từ 1 nhóm/)).toBeTruthy();
    expect(screen.getByText('Phạm vi rộng: không')).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Thư ký/));
    expect(screen.getByText(/3 quyền từ 2 nhóm/)).toBeTruthy();
    expect(screen.getByText('Quyền nhạy cảm: có')).toBeTruthy();
    expect(screen.getByText('Phạm vi rộng: có')).toBeTruthy();
  });

  it('allows creating an account with no group yet, and never offers a role or password field', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED', label: 'u1' }));
    render(<AddMemberForm officeId="o1" groups={groups} />);
    expect(screen.queryByText(/Vai trò/)).toBeNull();
    expect(screen.queryByLabelText(/Mật khẩu/)).toBeNull();
    fill();
    submit();
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(bodyOf(spy)).toMatchObject({ groupIds: [] });
  });

  it('pre-ticks the group permissions, and sends the ticked set plus branches only after a per-account change', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED', label: 'u2' }));
    pushSpy = vi.fn();
    render(
      <AddMemberForm officeId="o1" groups={groups} branches={[{ id: 'b1', name: 'Bắc Ninh' }]} />,
    );
    fill();
    fireEvent.click(screen.getByLabelText(/Văn thư chi nhánh/));
    const read = screen.getByLabelText('Văn thư · Văn bản đến · Xem hồ sơ (Hồ sơ do tôi tạo)');
    expect((read as HTMLInputElement).checked).toBe(true); // kế thừa từ nhóm
    const dl = screen.getByLabelText(
      'Văn thư · Văn bản đến · Tải tệp, in (Mọi hồ sơ của văn phòng)',
    );
    expect((dl as HTMLInputElement).checked).toBe(false);
    fireEvent.click(dl); // thêm riêng
    fireEvent.click(read); // bỏ riêng quyền của nhóm
    expect(screen.getByText(/Thêm riêng 1 quyền, bỏ riêng 1 quyền/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Bắc Ninh'));
    submit();
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const body = bodyOf(spy);
    expect([...(body.permissions as string[])].sort()).toEqual([
      'vtden.download.all',
      'vtden.draft.own',
    ]);
    expect(body.branchIds).toEqual(['b1']);
  });

  it('restoring to the group baseline stops sending a per-account permission set', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED', label: 'u3' }));
    pushSpy = vi.fn();
    render(<AddMemberForm officeId="o1" groups={groups} />);
    fill();
    fireEvent.click(screen.getByLabelText(/Văn thư chi nhánh/));
    fireEvent.click(screen.getByLabelText('Văn thư · Văn bản đến · Xem hồ sơ (Hồ sơ do tôi tạo)'));
    fireEvent.click(screen.getByRole('button', { name: 'Quay về đúng theo nhóm' }));
    submit();
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(bodyOf(spy)).not.toHaveProperty('permissions');
  });

  it('shows a readable message when the email already has an account', async () => {
    const push = vi.fn();
    pushSpy = push;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply(409, { code: 'EMAIL_IN_USE' }));
    render(<AddMemberForm officeId="o1" groups={groups} />);
    fill();
    submit();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('đã có tài khoản'));
    expect(push).not.toHaveBeenCalled();
  });
});

describe('BranchManager', () => {
  it('renames a branch with PATCH and adds one with POST', async () => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    HTMLDialogElement.prototype.close = vi.fn();
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED', label: 'b2' }));
    render(<BranchManager officeId="o1" branches={branches} />);
    fireEvent.click(screen.getByRole('button', { name: 'Đổi tên' }));
    fireEvent.change(screen.getByLabelText('Tên địa điểm Bắc Ninh'), {
      target: { value: 'Bắc Ninh 2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu tên mới' }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0]![0]).toBe('/api/admin/branches/b1');
    expect((spy.mock.calls[0]![1] as RequestInit).method).toBe('PATCH');
    expect(bodyOf(spy)).toEqual({ officeId: 'o1', name: 'Bắc Ninh 2' });
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm địa điểm' }));
    fireEvent.change(screen.getByLabelText('Tên địa điểm'), { target: { value: 'Hải Phòng' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm địa điểm', hidden: true }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy.mock.calls[1]![0]).toBe('/api/admin/branches');
    expect(bodyOf(spy, 1)).toEqual({ officeId: 'o1', name: 'Hải Phòng' });
  });

  it('shows the duplicate-name message', async () => {
    HTMLDialogElement.prototype.showModal = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      reply(409, { code: 'BRANCH_NAME_TAKEN' }),
    );
    render(<BranchManager officeId="o1" branches={branches} />);
    fireEvent.change(screen.getByLabelText('Tên địa điểm'), { target: { value: 'bắc ninh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm địa điểm', hidden: true }));
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('alert', { hidden: true })
          .some((a) => a.textContent?.includes('trùng tên')),
      ).toBe(true),
    );
  });
});

describe('describeRequest', () => {
  it('describes an ADD_MEMBER request with signing right and branch', () => {
    const base = {
      id: 'r',
      targetUserId: 'u',
      targetLabel: 'x',
      status: 'PENDING',
      reason: 'y',
      proposedBy: 'a',
      decisionNote: null,
    };
    expect(
      describeRequest({
        ...base,
        kind: 'ADD_MEMBER',
        role: 'VAN_THU',
        flag: false,
        branchName: 'Bắc Ninh',
      }),
    ).toBe('Thêm thành viên: Văn thư (Bắc Ninh)');
    expect(
      describeRequest({
        ...base,
        kind: 'ADD_MEMBER',
        role: 'TRUONG_VP',
        flag: true,
        branchName: null,
      }),
    ).toBe('Thêm thành viên: Trưởng văn phòng (có quyền ký pháp lý)');
  });
});
