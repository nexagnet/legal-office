import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from '../components/LoginForm';
import { AdjustBatchForm, NewItemForm, StockMovementForm } from '../components/StockForms';
import { NewFormUpload } from '../components/NewFormUpload';
import { messageFor } from '../lib/messages';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  push.mockClear();
  refresh.mockClear();
});

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('LoginForm', () => {
  const fill = () => {
    fireEvent.change(screen.getByLabelText('Email hoặc số CCCD'), {
      target: { value: 'a@example.test' },
    });
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
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Email, số CCCD hoặc mật khẩu không đúng.',
    );
    spy.mockImplementationOnce(() => reply(429, { code: 'ACCOUNT_LOCKED' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('tạm khóa 15 phút'),
    );
    expect(push).not.toHaveBeenCalled();
  });
});

describe('messageFor', () => {
  it('maps known codes and keeps unknown ones visible', () => {
    expect(messageFor('BRANCH_NOT_GRANTED')).toContain('chưa được cấp quyền');
    expect(messageFor('SOMETHING_NEW')).toContain('SOMETHING_NEW');
    expect(messageFor(undefined)).toContain('thử lại');
  });
});

describe('Stock forms', () => {
  const branches = [{ id: 'b1', name: 'CN1', officeId: 'o1' }] as never;
  const items = [{ itemId: 'i1', name: 'Giấy A4' }];

  it('adds an item', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED', label: 'i1' }));
    render(<NewItemForm officeId="o1" />);
    fireEvent.change(screen.getByLabelText('Tên vật tư'), { target: { value: 'Giấy A4' } });
    fireEvent.change(screen.getByLabelText('Đơn vị tính'), { target: { value: 'ram' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(spy.mock.calls[0]![0]).toBe('/api/office/items');
    expect(JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      officeId: 'o1',
      name: 'Giấy A4',
      unit: 'ram',
    });
  });

  it('receives then issues with the right payload and shows stock errors', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => reply(200, { code: 'ALLOWED', label: 'b1' }))
      .mockImplementationOnce(() => reply(409, { code: 'INSUFFICIENT_STOCK' }));
    render(<StockMovementForm items={items} branches={branches} />);
    fireEvent.change(screen.getByLabelText('Số lượng'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Số phiếu nhập'), { target: { value: 'PN-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Nhập kho' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(spy.mock.calls[0]![0]).toBe('/api/office/items/i1/receipts');
    expect(JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      branchId: 'b1',
      quantity: 5,
      receiptRef: 'PN-1',
    });
    fireEvent.change(screen.getByLabelText('Thao tác'), { target: { value: 'issues' } });
    fireEvent.change(screen.getByLabelText('Số lượng'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Mục đích xuất'), { target: { value: 'Dùng' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xuất kho' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Tồn kho không đủ để xuất.');
    expect(spy.mock.calls[1]![0]).toBe('/api/office/items/i1/issues');
  });

  it('adjusts a batch with a reason', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED', label: '-1' }));
    render(<AdjustBatchForm batchId="bt1" remaining={4} received={10} />);
    fireEvent.change(screen.getByLabelText('Số còn lại mới'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Kiểm kê' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm kê' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(spy.mock.calls[0]![0]).toBe('/api/office/batches/bt1/adjustment');
    expect(JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      newRemaining: 3,
      reason: 'Kiểm kê',
    });
  });
});

describe('NewFormUpload', () => {
  it('uploads a TT06 form with the code and title in the query', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED', label: 'I v1' }));
    const { container } = render(<NewFormUpload officeId="o1" />);
    fireEvent.change(screen.getByLabelText('Phụ lục'), { target: { value: 'III' } });
    fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: 'Mẫu giả lập' } });
    const file = new File(['x'], 'm.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/Tệp biểu mẫu/), { target: { files: [file] } });
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const url = new URL(String(spy.mock.calls[0]![0]), 'http://x');
    expect(url.pathname).toBe('/api/office/tt06-form-files');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      officeId: 'o1',
      code: 'III',
      title: 'Mẫu giả lập',
    });
  });

  it('refuses without a file and shows the API error', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(403, { code: 'ADMIN_OR_HEAD_ONLY' }));
    const { container } = render(<NewFormUpload officeId="o1" />);
    fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: 'x' } });
    fireEvent.submit(container.querySelector('form')!);
    expect((await screen.findByRole('alert')).textContent).toBe(messageFor('INVALID_DOCUMENT'));
    expect(spy).not.toHaveBeenCalled();
    const file = new File(['x'], 'm.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/Tệp biểu mẫu/), { target: { files: [file] } });
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(messageFor('ADMIN_OR_HEAD_ONLY')),
    );
  });
});
