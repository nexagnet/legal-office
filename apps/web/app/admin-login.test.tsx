// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChangePasswordForm } from '../components/ChangePasswordForm';
import { ForgotPasswordForm } from '../components/ForgotPasswordForm';
import { LoginForm } from '../components/LoginForm';
import { ResetPasswordForm } from '../components/ResetPasswordForm';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  push.mockClear();
});

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const T = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'a'.repeat(43);
const PW_FAKE = 'mat-khau-gia-lap-1';
const PW_NEW = 'mat-khau-moi-dai-1';

function fillLogin(identifier = 'admin@example.test') {
  fireEvent.change(screen.getByLabelText('Email hoặc số CCCD'), { target: { value: identifier } });
  fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'mat-khau-gia-lap-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
}

describe('LoginForm — email hoặc CCCD + mật khẩu', () => {
  it('mật khẩu đúng vào thẳng trang chủ; không còn đăng nhập bằng link email', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => reply(200, { code: 'ALLOWED' }));
    render(<LoginForm tenantId={T} />);
    expect(screen.queryByRole('button', { name: /email/i })).toBeNull();
    fillLogin();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/auth/login');
  });

  it('gửi số CCCD trong cùng trường định danh', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => reply(200, { code: 'ALLOWED' }));
    render(<LoginForm tenantId={T} />);
    fillLogin(' 012345678901 ');
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body))).toEqual({
      tenantId: T,
      email: '012345678901',
      password: PW_FAKE,
    });
  });

  it('tài khoản mới / vừa được đặt lại mật khẩu bị chuyển sang trang đổi mật khẩu', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() =>
      reply(200, { code: 'ALLOWED', mustChangePassword: true }),
    );
    render(<LoginForm tenantId={T} />);
    fillLogin();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/doi-mat-khau'));
  });

  it('sai thông tin hoặc bị khóa thì báo lỗi và ở lại; có liên kết Quên mật khẩu', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => reply(401, { code: 'INVALID_CREDENTIALS' }))
      .mockImplementationOnce(() => reply(429, {}));
    render(<LoginForm tenantId={T} />);
    expect(screen.getByRole('link', { name: 'Quên mật khẩu?' }).getAttribute('href')).toBe(
      '/quen-mat-khau',
    );
    fillLogin();
    await screen.findByText(/CCCD hoặc mật khẩu không đúng/);
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await screen.findByText(/tạm khóa 15 phút/);
    expect(push).not.toHaveBeenCalled();
  });
});

describe('ForgotPasswordForm', () => {
  it('gửi định danh rồi hiện thông báo kiểm tra email (không lộ tài khoản có tồn tại hay không)', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'RESET_REQUESTED' }));
    render(<ForgotPasswordForm tenantId={T} />);
    fireEvent.change(screen.getByLabelText('Email hoặc số CCCD'), {
      target: { value: 'an@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi link đặt lại mật khẩu' }));
    await screen.findByText('Kiểm tra email của bạn');
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/auth/forgot-password');
    expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body))).toEqual({
      tenantId: T,
      identifier: 'an@example.test',
    });
  });
});

describe('ResetPasswordForm', () => {
  it('hai mật khẩu khác nhau thì không gọi API; đặt xong hiện nút đăng nhập', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED' }));
    render(<ResetPasswordForm tenantId={T} token={TOKEN} />);
    fireEvent.change(screen.getByLabelText(/Mật khẩu mới/), {
      target: { value: 'mat-khau-moi-dai-1' },
    });
    fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu mới'), {
      target: { value: 'mat-khau-khac-dai-2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mật khẩu mới' }));
    await screen.findByText('Hai mật khẩu chưa giống nhau.');
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu mới'), {
      target: { value: 'mat-khau-moi-dai-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mật khẩu mới' }));
    await screen.findByText('Đã đặt mật khẩu mới');
    expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body))).toEqual({
      tenantId: T,
      token: TOKEN,
      password: PW_NEW,
    });
  });

  it('link đã dùng thì báo lỗi', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      reply(422, { code: 'RESET_INVALID', label: null }),
    );
    render(<ResetPasswordForm tenantId={T} token={TOKEN} />);
    fireEvent.change(screen.getByLabelText(/Mật khẩu mới/), {
      target: { value: 'mat-khau-moi-dai-1' },
    });
    fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu mới'), {
      target: { value: 'mat-khau-moi-dai-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu mật khẩu mới' }));
    await screen.findByText(/không hợp lệ, đã dùng hoặc đã hết hạn/);
  });
});

describe('ChangePasswordForm', () => {
  it('bắt buộc: có lời nhắc, đổi thành công thì về trang chủ', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED' }));
    render(<ChangePasswordForm forced />);
    expect(screen.getByText(/do quản trị viên đặt/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại'), {
      target: { value: 'mat-khau-cu-12345' },
    });
    fireEvent.change(screen.getByLabelText(/Mật khẩu mới/), {
      target: { value: 'mat-khau-moi-dai-1' },
    });
    fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu mới'), {
      target: { value: 'mat-khau-moi-dai-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/auth/change-password');
  });

  it('mật khẩu hiện tại sai thì báo lỗi và ở lại', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      reply(422, { code: 'WRONG_PASSWORD', label: null }),
    );
    render(<ChangePasswordForm forced={false} />);
    fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại'), {
      target: { value: 'sai-mat-khau-xyz' },
    });
    fireEvent.change(screen.getByLabelText(/Mật khẩu mới/), {
      target: { value: 'mat-khau-moi-dai-1' },
    });
    fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu mới'), {
      target: { value: 'mat-khau-moi-dai-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    await screen.findByText('Mật khẩu hiện tại chưa đúng.');
    expect(push).not.toHaveBeenCalled();
  });
});
