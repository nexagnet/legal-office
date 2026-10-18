import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MailSettingsForm, type MailSettings } from '../components/MailSettingsForm';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockClear();
});

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const base: MailSettings = {
  keyReady: true,
  configured: true,
  host: 'smtp.example.test',
  port: 465,
  secure: true,
  username: 'no-reply@example.test',
  hasPassword: true,
  mailFrom: 'Legal Office <no-reply@example.test>',
  updatedAt: null,
  testTo: 'admin@example.test',
};

describe('MailSettingsForm', () => {
  it('không gửi mật khẩu khi để trống và không hiển thị mật khẩu đã lưu', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply(200, {}));
    render(<MailSettingsForm officeId="o1" settings={base} />);
    const pw = screen.getByLabelText('Mật khẩu SMTP') as HTMLInputElement;
    expect(pw.value).toBe('');
    expect(pw.placeholder).toMatch(/giữ nguyên/);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/office/mail-settings');
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      officeId: 'o1',
      host: 'smtp.example.test',
      port: 465,
      secure: true,
    });
    expect('password' in body).toBe(false);
    await screen.findByText('Đã lưu cấu hình email.');
    expect(refresh).toHaveBeenCalled();
  });

  it('gửi mật khẩu mới khi có nhập; báo lỗi bằng tiếng Việt; gửi thư thử tới email của Admin', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => reply(503, { code: 'MAIL_KEY_MISSING' }))
      .mockImplementationOnce(() => reply(200, { code: 'ALLOWED', label: 'admin@example.test' }));
    render(<MailSettingsForm officeId="o1" settings={base} />);
    fireEvent.change(screen.getByLabelText('Mật khẩu SMTP'), { target: { value: 'moi-gia-lap' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình' }));
    await screen.findByText(/chưa có khoá mã hoá/);
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toMatchObject({
      password: 'moi-gia-lap',
    });
    fireEvent.click(screen.getByRole('button', { name: /Gửi thư thử tới admin@example.test/ }));
    await screen.findByText('Đã gửi thư thử tới admin@example.test.');
  });

  it('cảnh báo thiếu khoá mã hoá và khoá nút thử khi chưa cấu hình', () => {
    render(
      <MailSettingsForm
        officeId="o1"
        settings={{
          ...base,
          keyReady: false,
          configured: false,
          hasPassword: false,
          host: null,
          port: null,
        }}
      />,
    );
    expect(screen.getByText('Chưa bật được lưu mật khẩu')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: /Gửi thư thử/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
