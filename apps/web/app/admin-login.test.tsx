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

describe('LoginForm — bước email của Admin', () => {
  it('chuyển sang nhập mã khi API yêu cầu xác thực, rồi vào trang chủ khi mã đúng', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => reply(200, { code: 'VERIFICATION_REQUIRED' }))
      .mockImplementationOnce(() => reply(200, { code: 'ALLOWED' }));
    render(<LoginForm tenantId={T} />);
    fillLogin();
    await screen.findByText('Xác thực đăng nhập');
    expect(push).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Mã xác thực'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe('/api/auth/login/verify');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ code: '123456' });
  });

  it('sai mã thì ở lại bước nhập mã; phiên hết hạn thì quay về bước mật khẩu', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => reply(200, { code: 'VERIFICATION_REQUIRED' }))
      .mockImplementationOnce(() => reply(401, { code: 'INVALID_CODE' }))
      .mockImplementationOnce(() => reply(401, { code: 'CHALLENGE_EXPIRED' }));
    render(<LoginForm tenantId={T} />);
    fillLogin();
    await screen.findByLabelText('Mã xác thực');
    fireEvent.change(screen.getByLabelText('Mã xác thực'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await screen.findByText(/Mã xác thực chưa đúng/);
    expect(screen.getByLabelText('Mã xác thực')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await screen.findByLabelText('Mật khẩu');
    expect(screen.getByText(/đã hết hạn/)).toBeTruthy();
  });

  it('báo lỗi gửi email thay vì vào trang', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      reply(502, { code: 'VERIFICATION_MAIL_FAILED' }),
    );
    render(<LoginForm tenantId={T} />);
    fillLogin();
    await screen.findByText(/Không gửi được email xác thực/);
    expect(push).not.toHaveBeenCalled();
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
