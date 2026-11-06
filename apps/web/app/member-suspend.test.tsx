import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberSuspendButton } from '../components/permissions/MemberSuspendButton';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockClear();
});

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('MemberSuspendButton', () => {
  it('khóa: gửi lý do tới API và làm mới trang', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'MEMBER_SUSPENDED' }));
    render(<MemberSuspendButton userId="u1" officeId="o1" suspended={false} />);
    fireEvent.change(screen.getByLabelText('Lý do', { selector: 'input' }), {
      target: { value: 'Nghỉ việc' },
    });
    fireEvent.submit(screen.getByLabelText('Lý do', { selector: 'input' }).closest('form')!);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(spy.mock.calls[0]![0]).toBe('/api/admin/members/u1/suspension');
    expect(JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      officeId: 'o1',
      suspended: true,
      reason: 'Nghỉ việc',
    });
  });

  it('mở khóa gửi suspended=false; lỗi từ máy chủ hiện bằng tiếng Việt', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      reply(409, { code: 'WOULD_REMOVE_LAST_APPROVER' }),
    );
    render(<MemberSuspendButton userId="u1" officeId="o1" suspended />);
    expect(screen.getAllByText('Mở khóa tài khoản', { selector: 'button' }).length).toBeGreaterThan(
      0,
    );
    const input = screen.getByLabelText('Lý do', { selector: 'input' });
    fireEvent.change(input, { target: { value: 'ok' } });
    fireEvent.submit(input.closest('form')!);
    const alert = await screen.findByRole('alert', { hidden: true });
    await waitFor(() => expect(alert.textContent).toContain('người duyệt cuối cùng'));
    expect(refresh).not.toHaveBeenCalled();
  });
});
