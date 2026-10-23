// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContractAddenda } from '../components/ContractAddenda';

vi.mock('../components/ui/date-picker', () => ({
  DatePicker: ({ id, onChange }: { id: string; onChange: (v: string) => void }) => (
    <input id={id} aria-label="Ngày hiệu lực" onChange={(e) => onChange(e.target.value)} />
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const list = [
  {
    id: 1,
    seq: 1,
    kind: 'EXTEND',
    summary: 'Gia hạn thêm 6 tháng',
    effectiveFrom: '2026-11-01',
    attachmentId: 7,
  },
];
const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

describe('Phụ lục hợp đồng', () => {
  it('liệt kê phụ lục với loại, ngày hiệu lực dd/MM/yyyy và liên kết bản scan', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(list));
    render(<ContractAddenda contractId="k1" active />);
    expect(await screen.findByText('Phụ lục 1')).toBeTruthy();
    expect(screen.getByText(/Gia hạn \/ điều chỉnh thời hạn/)).toBeTruthy();
    expect(screen.getByText(/01\/11\/2026/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Bản scan' }).getAttribute('href')).toBe(
      '/api/vibang/contracts/k1/attachments/7',
    );
  });

  it('chưa mở thì không gọi máy chủ', () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json([]));
    render(<ContractAddenda contractId="k1" active={false} />);
    expect(f).not.toHaveBeenCalled();
    expect(screen.getByText('Chưa có phụ lục.')).toBeTruthy();
  });

  it('đòi ngày, nội dung và bản scan đã ký trước khi gửi', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json([]));
    render(<ContractAddenda contractId="k1" active={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Thêm phụ lục hợp đồng' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu phụ lục' }));
    expect(await screen.findByText('Hãy mô tả nội dung thay đổi')).toBeTruthy();
    expect(screen.getByText('Hãy chọn ngày hiệu lực')).toBeTruthy();
    expect(screen.getByText('Hãy chọn bản scan phụ lục đã ký')).toBeTruthy();
    expect(f).not.toHaveBeenCalled();
  });

  it('gửi tệp kèm loại, ngày, nội dung rồi tải lại danh sách', async () => {
    const f = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({ ok: true, code: 'ALLOWED' }))
      .mockResolvedValueOnce(json(list));
    render(<ContractAddenda contractId="k1" active />);
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Thêm phụ lục hợp đồng' }));
    fireEvent.change(screen.getByLabelText('Loại thay đổi'), { target: { value: 'SCOPE' } });
    fireEvent.change(screen.getByLabelText('Ngày hiệu lực'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('Nội dung thay đổi'), {
      target: { value: 'Bổ sung phạm vi' },
    });
    fireEvent.change(screen.getByLabelText('Tệp phụ lục đã ký'), {
      target: { files: [new File(['x'], 'pl1.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu phụ lục' }));
    expect(await screen.findByText('Phụ lục 1')).toBeTruthy();
    const [url, init] = f.mock.calls[1]!;
    expect(String(url)).toBe(
      '/api/vibang/contracts/k1/addendum-files?kind=SCOPE&effectiveFrom=2026-11-01&summary=B%E1%BB%95+sung+ph%E1%BA%A1m+vi&name=pl1.pdf',
    );
    expect((init as RequestInit).headers).toEqual({ 'content-type': 'application/pdf' });
  });

  it('báo lỗi tiếng Việt khi máy chủ từ chối và giữ ngăn kéo mở', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({ code: 'ROLE_LACKS_PERMISSION' }, false));
    render(<ContractAddenda contractId="k1" active />);
    fireEvent.click(screen.getByRole('button', { name: 'Thêm phụ lục hợp đồng' }));
    fireEvent.change(screen.getByLabelText('Ngày hiệu lực'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('Nội dung thay đổi'), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText('Tệp phụ lục đã ký'), {
      target: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu phụ lục' }));
    expect(await screen.findByText('Chưa lưu được phụ lục')).toBeTruthy();
  });
});
