// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeleteScanButton } from '../components/DeleteScanButton';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

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

async function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Xóa scan' }));
  return screen.findByRole('form', { name: 'Xóa file scan' });
}

describe('DeleteScanButton (xóa file scan, N6)', () => {
  it('hộp thoại nói rõ hậu quả: chỉ xóa scan, vào Scan đã xóa 30 ngày, không khôi phục', async () => {
    render(<DeleteScanButton kind="document" fileId="f1" label="scan-1.pdf" />);
    await open();
    expect(screen.getByText(/scan-1\.pdf/)).toBeTruthy();
    expect(screen.getByText(/hồ sơ, STT và dòng sổ vẫn còn nguyên/)).toBeTruthy();
    expect(screen.getByText(/Scan đã xóa 30 ngày/)).toBeTruthy();
    expect(screen.getByText(/Không khôi phục được/)).toBeTruthy();
  });

  it('gửi đúng loại, id file và lý do rồi làm mới trang', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'SCAN_DELETED', label: null }));
    render(<DeleteScanButton kind="submission" fileId="f9" label="x.pdf" />);
    const form = await open();
    fireEvent.change(screen.getByLabelText('Lý do xóa'), { target: { value: 'Tải nhầm' } });
    fireEvent.submit(form);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(String(spy.mock.calls[0]![0])).toBe('/api/dms/scans/delete');
    expect(JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      kind: 'submission',
      fileId: 'f9',
      reason: 'Tải nhầm',
    });
  });

  it('thiếu lý do thì không gọi API', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    render(<DeleteScanButton kind="document" fileId="f1" label="a.pdf" />);
    const form = await open();
    fireEvent.change(screen.getByLabelText('Lý do xóa'), { target: { value: '   ' } });
    fireEvent.submit(form);
    expect((await screen.findByRole('alert')).textContent).toContain('lý do');
    expect(spy).not.toHaveBeenCalled();
  });

  it('không có quyền xóa thì báo tiếng Việt, giữ hộp thoại và không làm mới', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      reply(403, { code: 'PERMISSION_DENIED', label: null }),
    );
    render(<DeleteScanButton kind="document" fileId="f1" label="a.pdf" />);
    const form = await open();
    fireEvent.change(screen.getByLabelText('Lý do xóa'), { target: { value: 'Thử' } });
    fireEvent.submit(form);
    await screen.findByRole('alert');
    expect(refresh).not.toHaveBeenCalled();
  });
});
