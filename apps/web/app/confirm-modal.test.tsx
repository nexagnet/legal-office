import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DmsAmendmentReview } from '../components/DmsAmendments';
import { DmsDraftActions } from '../components/DmsCaseActions';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const okFetch = () =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({}) } as Response);

describe('hộp xác nhận trong trang (không dùng hộp thoại gốc của trình duyệt)', () => {
  it('ghi sổ: bấm nút mở modal, chỉ gửi khi bấm "Lưu chính thức"', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const fetchMock = okFetch();
    render(<DmsDraftActions caseId="c1" canRecord canCancel={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận lưu chính thức' }));
    expect(fetchMock).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('không thể sửa trực tiếp');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu chính thức' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/dms/cases/c1/record',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(confirm).not.toHaveBeenCalled();
  });

  it('từ chối sửa đổi: nút xác nhận khoá cho tới khi có lý do', async () => {
    const prompt = vi.spyOn(window, 'prompt');
    const fetchMock = okFetch();
    render(<DmsAmendmentReview requestId="r1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    await screen.findByRole('dialog');
    const buttons = screen.getAllByRole('button', { name: 'Từ chối' });
    const submit = buttons[buttons.length - 1] as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Lý do từ chối/), { target: { value: 'Thiếu scan' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body))).toEqual({
      approve: false,
      note: 'Thiếu scan',
    });
    expect(prompt).not.toHaveBeenCalled();
  });
});
