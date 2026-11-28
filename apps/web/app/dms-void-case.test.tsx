import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DmsVoidCase } from '../components/DmsCaseActions';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Admin hủy hồ sơ', () => {
  it('nút OK chỉ bật khi có lý do và gõ đúng cụm xác nhận, rồi gọi API hủy', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: vi.fn() },
      writable: true,
    });
    render(<DmsVoidCase caseId="c1" label="vi bằng" noteText="Đã hủy vi bằng" />);
    fireEvent.click(screen.getByRole('button', { name: 'Hủy vi bằng' }));
    const ok = screen.getByRole('button', { name: 'OK' });
    expect((ok as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Lý do hủy'), { target: { value: 'Nhập nhầm' } });
    fireEvent.change(screen.getByLabelText(/Gõ đúng/), { target: { value: 'sai cụm' } });
    expect((ok as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Gõ đúng/), { target: { value: 'dong y xuan ban' } });
    expect((ok as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(ok);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/dms/cases/c1/void');
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      reason: 'Nhập nhầm',
      confirm: 'dong y xuan ban',
    });
  });
});
