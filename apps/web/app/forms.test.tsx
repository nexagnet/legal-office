import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from '../components/LoginForm';
import { CaseActions } from '../components/CaseActions';
import { ChangeDecision } from '../components/ChangeRequestRow';
import { NewCaseForm } from '../components/NewCaseForm';
import { messageFor } from '../lib/messages';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  push.mockClear();
  refresh.mockClear();
});

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('LoginForm', () => {
  const fill = () => {
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.test' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'mat-khau-gia-lap' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
  };

  it('sends the configured tenant with the credentials and goes home on success', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED' }));
    render(<LoginForm tenantId="t-1" />);
    fill();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/auth/login');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      tenantId: 't-1',
      email: 'a@example.test',
      password: 'mat-khau-gia-lap',
    });
  });

  it('shows a clear message for wrong credentials and for a locked account', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    spy.mockImplementationOnce(() => reply(401, { code: 'INVALID_CREDENTIALS' }));
    render(<LoginForm tenantId="t-1" />);
    fill();
    expect((await screen.findByRole('alert')).textContent).toBe('Email hoặc mật khẩu không đúng.');
    spy.mockImplementationOnce(() => reply(429, { code: 'ACCOUNT_LOCKED' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('tạm khoá 15 phút'),
    );
    expect(push).not.toHaveBeenCalled();
  });
});

describe('NewCaseForm', () => {
  const branches = [{ id: 'b1', officeId: 'o1', name: 'CN1' }];
  const fill = () => {
    fireEvent.change(screen.getByLabelText('Mã tham chiếu khách hàng'), {
      target: { value: 'KH-1' },
    });
    fireEvent.change(screen.getByLabelText('Tiêu đề hồ sơ'), {
      target: { value: 'Hồ sơ giả lập' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp nhận hồ sơ' }));
  };

  it('creates the customer, then the case in the chosen branch, and refreshes the list', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => reply(200, { code: 'ALLOWED', label: 'cust-1' }))
      .mockImplementationOnce(() => reply(200, { code: 'ALLOWED', label: 'case-1' }));
    render(<NewCaseForm branches={branches} />);
    fill();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(spy.mock.calls.map((c) => c[0])).toEqual(['/api/vibang/customers', '/api/vibang/cases']);
    expect(JSON.parse((spy.mock.calls[1]![1] as RequestInit).body as string)).toMatchObject({
      officeId: 'o1',
      branchId: 'b1',
      customerId: 'cust-1',
      title: 'Hồ sơ giả lập',
    });
  });

  it('shows the server reason and does not create a case when the customer step is denied', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(403, { code: 'ROLE_LACKS_PERMISSION' }));
    render(<NewCaseForm branches={branches} />);
    fill();
    expect((await screen.findByRole('alert')).textContent).toContain('Vai trò của bạn không được');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('explains when there is no branch to use', () => {
    render(<NewCaseForm branches={[]} />);
    expect(screen.getByText(/chưa có chi nhánh/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('messageFor', () => {
  it('maps known codes and keeps unknown ones visible', () => {
    expect(messageFor('BRANCH_NOT_GRANTED')).toContain('chưa được cấp quyền');
    expect(messageFor('SOMETHING_NEW')).toContain('SOMETHING_NEW');
    expect(messageFor(undefined)).toContain('thử lại');
  });
});

describe('CaseActions', () => {
  const props = { caseId: 'c1', title: 'T', description: 'D', isFinal: false, canCancel: true };

  it('edits directly inside the 48-hour window', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED' }));
    render(<CaseActions {...props} windowOpen />);
    fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: 'Mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/vibang/cases/c1/details');
    expect((init as RequestInit).method).toBe('PUT');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      title: 'Mới',
      description: 'D',
    });
  });

  it('files a change request after 48 hours and shows server denials in Vietnamese', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    spy.mockImplementationOnce(() => reply(403, { code: 'ROLE_LACKS_PERMISSION' }));
    render(<CaseActions {...props} windowOpen={false} canCancel={false} />);
    expect(screen.queryByRole('button', { name: 'Huỷ hồ sơ' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Giá trị mới'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Sai chính tả' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề nghị' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Vai trò của bạn không được thực hiện thao tác này.',
    );
    expect(spy.mock.calls[0]![0]).toBe('/api/vibang/cases/c1/change-requests');
  });

  it('hides editing for finished cases', () => {
    render(<CaseActions {...props} windowOpen isFinal canCancel />);
    expect(screen.getByText(/không thể sửa/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Huỷ hồ sơ' })).toBeNull();
  });
});

describe('ChangeDecision', () => {
  it('lets only Admin decide and posts the decision', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED' }));
    const { unmount } = render(<ChangeDecision requestId="r1" canDecide={false} />);
    expect(screen.queryByRole('button', { name: 'Duyệt' })).toBeNull();
    unmount();
    render(<ChangeDecision requestId="r1" canDecide />);
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/vibang/change-requests/r1/decision');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ accept: false });
  });
});
