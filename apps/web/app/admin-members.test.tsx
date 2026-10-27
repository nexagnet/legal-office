import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddMemberForm } from '../components/AddMemberForm';
import { AdminNav } from '../components/AdminNav';
import { BranchManager } from '../components/BranchManager';
import { describeRequest } from '../lib/admin-describe';

const refresh = vi.fn();
let pathname = '/quan-tri/nhan-su';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
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

describe('AddMemberForm', () => {
  it('sends a Văn thư with a branch and no password by default (email-link login)', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED', label: 'r1' }));
    render(<AddMemberForm officeId="o1" branches={branches} />);
    fireEvent.change(screen.getByLabelText('Họ và tên'), { target: { value: 'Hoàng An Nhiên' } });
    fireEvent.change(screen.getByLabelText('Email đăng nhập'), {
      target: { value: 'nhien@example.test' },
    });
    fireEvent.click(screen.getByLabelText('Văn thư'));
    fireEvent.click(screen.getByLabelText('Bắc Ninh'));
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'nhân sự mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm và gửi đề xuất' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(spy.mock.calls[0]![0]).toBe('/api/admin/members');
    expect(bodyOf(spy)).toEqual({
      officeId: 'o1',
      email: 'nhien@example.test',
      fullName: 'Hoàng An Nhiên',
      role: 'VAN_THU',
      legalSigner: false,
      branchId: 'b1',
      temporaryPassword: null,
      reason: 'nhân sự mới',
    });
  });

  it('offers the signing right only to Admin and Trưởng văn phòng, and the password only on request', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED', label: 'r1' }));
    render(<AddMemberForm officeId="o1" branches={branches} />);
    expect(screen.queryByLabelText(/Cấp quyền ký pháp lý/)).toBeNull();
    expect(screen.queryByLabelText(/Mật khẩu tạm/)).toBeNull();
    fireEvent.click(screen.getByLabelText('Trưởng văn phòng'));
    fireEvent.click(screen.getByLabelText(/Cấp quyền ký pháp lý/));
    fireEvent.click(screen.getByLabelText(/Đặt mật khẩu tạm/));
    fireEvent.change(screen.getByLabelText('Họ và tên'), { target: { value: 'Trần Tuấn' } });
    fireEvent.change(screen.getByLabelText('Email đăng nhập'), {
      target: { value: 't@example.test' },
    });
    fireEvent.change(screen.getByLabelText(/Mật khẩu tạm/), {
      target: { value: 'mat-khau-tam-12345' },
    });
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'bổ nhiệm' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm và gửi đề xuất' }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(bodyOf(spy)).toMatchObject({
      role: 'TRUONG_VP',
      legalSigner: true,
      branchId: null,
      temporaryPassword: 'mat-khau-tam-12345',
    });
  });

  it('shows a readable message when the email already has an account', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply(409, { code: 'EMAIL_IN_USE' }));
    render(<AddMemberForm officeId="o1" branches={branches} />);
    fireEvent.change(screen.getByLabelText('Họ và tên'), { target: { value: 'A B' } });
    fireEvent.change(screen.getByLabelText('Email đăng nhập'), {
      target: { value: 'a@example.test' },
    });
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm và gửi đề xuất' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('đã có tài khoản'));
    expect(refresh).not.toHaveBeenCalled();
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
