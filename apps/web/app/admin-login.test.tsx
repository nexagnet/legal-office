import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from '../components/LoginForm';
import { VerifyLink } from '../components/VerifyLink';

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

function fillLogin() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@example.test' } });
  fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'mat-khau-gia-lap-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
}

function startEmail() {
  fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập bằng email' }));
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Gửi link qua email' }));
}

describe('LoginForm — mọi tài khoản chọn mật khẩu hoặc email', () => {
  it('mật khẩu đúng vào thẳng trang chủ, không có bước thứ hai', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => reply(200, { code: 'ALLOWED' }));
    render(<LoginForm tenantId={T} />);
    fillLogin();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/auth/login');
  });

  it('đăng nhập bằng email: gửi email, nhập mã đúng thì vào trang chủ', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => reply(200, { code: 'VERIFICATION_REQUIRED' }))
      .mockImplementationOnce(() => reply(200, { code: 'ALLOWED' }));
    render(<LoginForm tenantId={T} />);
    startEmail();
    await screen.findByText('Xác thực đăng nhập');
    expect(push).not.toHaveBeenCalled();
    const [url0, init0] = fetchMock.mock.calls[0]!;
    expect(url0).toBe('/api/auth/login/email');
    expect(JSON.parse(String((init0 as RequestInit).body))).toEqual({
      tenantId: T,
      email: 'admin@example.test',
    });
    fireEvent.change(screen.getByLabelText('Mã xác thực'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe('/api/auth/login/verify');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ code: '123456' });
  });

  it('sai mã thì ở lại bước nhập mã; phiên hết hạn thì quay về bước email', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => reply(200, { code: 'VERIFICATION_REQUIRED' }))
      .mockImplementationOnce(() => reply(401, { code: 'INVALID_CODE' }))
      .mockImplementationOnce(() => reply(401, { code: 'CHALLENGE_EXPIRED' }));
    render(<LoginForm tenantId={T} />);
    startEmail();
    await screen.findByLabelText('Mã xác thực');
    fireEvent.change(screen.getByLabelText('Mã xác thực'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await screen.findByText(/Mã xác thực chưa đúng/);
    expect(screen.getByLabelText('Mã xác thực')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await screen.findByRole('button', { name: 'Gửi link qua email' });
    expect(screen.getByText(/đã hết hạn/)).toBeTruthy();
  });
});

describe('VerifyLink', () => {
  it('không gọi API khi mở trang; chỉ hiện mã sau khi bấm nút', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { verificationCode: '654321', validMinutes: 10 }));
    render(<VerifyLink tenantId={T} token={TOKEN} />);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Hiện mã xác thực' }));
    await screen.findByText('654321');
    expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body))).toEqual({
      tenantId: T,
      token: TOKEN,
    });
  });

  it('link đã dùng thì báo lỗi, không hiện mã', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply(422, { code: 'LINK_INVALID' }));
    render(<VerifyLink tenantId={T} token={TOKEN} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hiện mã xác thực' }));
    await screen.findByText(/không hợp lệ, đã dùng hoặc đã hết hạn/);
  });
});
