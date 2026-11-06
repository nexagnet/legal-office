import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
});
