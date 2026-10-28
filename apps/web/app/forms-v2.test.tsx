import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatutoryDeadlineActions } from '../components/StatutoryDeadlineActions';
import { TerminationSheet } from '../components/TerminationSheet';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockClear();
});

const ok = () => ({ ok: true, json: async () => ({}) }) as Response;
const fail = (code: string, status = 403) =>
  ({ ok: false, status, json: async () => ({ code }) }) as Response;

describe('Hạn pháp định (Sheet + React Hook Form + Zod)', () => {
  it('đòi ghi chú rồi gửi "đã làm xong" và làm mới trang', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok());
    render(<StatutoryDeadlineActions id="d1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Đã làm xong' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Hãy ghi đã làm gì')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Đã làm gì'), {
      target: { value: 'Gửi kết quả cho Tòa án' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/office/deadlines/d1/done',
      expect.objectContaining({ body: JSON.stringify({ note: 'Gửi kết quả cho Tòa án' }) }),
    );
  });

  it('hiện hạn thỏa thuận dd/MM/yyyy, đòi chọn ngày và lý do', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok());
    render(<StatutoryDeadlineActions id="d2" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ghi hạn thỏa thuận' }));
    expect(screen.getByLabelText('Hạn thỏa thuận mới').textContent).toBe('dd/MM/yyyy');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Hãy chọn hạn thỏa thuận mới')).toBeTruthy();
    expect(screen.getByText('Hãy ghi các bên thỏa thuận thế nào')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('báo lỗi tiếng Việt của máy chủ và không đóng ngăn kéo', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(fail('FORBIDDEN'));
    render(<StatutoryDeadlineActions id="d3" />);
    fireEvent.click(screen.getByRole('button', { name: 'Đã làm xong' }));
    fireEvent.change(screen.getByLabelText('Đã làm gì'), { target: { value: 'Xong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Chưa lưu được')).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('Chấm dứt tổ chức thi hành án (Điều 46)', () => {
  it('đòi căn cứ và văn bản trước khi gửi', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok());
    render(<TerminationSheet caseId="c1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Chấm dứt hồ sơ' }));
    const buttons = screen.getAllByRole('button', { name: 'Chấm dứt hồ sơ' });
    fireEvent.click(buttons[buttons.length - 1]!);
    expect(await screen.findByText('Hãy ghi căn cứ pháp lý')).toBeTruthy();
    expect(screen.getByText('Hãy chọn văn bản chấm dứt')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gửi tệp kèm lý do và căn cứ rồi làm mới trang', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok());
    render(<TerminationSheet caseId="c1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Chấm dứt hồ sơ' }));
    fireEvent.change(screen.getByLabelText('Lý do chấm dứt'), {
      target: { value: 'NO_CONDITIONS' },
    });
    fireEvent.change(screen.getByLabelText('Căn cứ pháp lý'), {
      target: { value: 'Điều 46 Luật THADS' },
    });
    fireEvent.change(screen.getByLabelText('Kết quả thực tế'), {
      target: { value: 'Đã báo đương sự' },
    });
    const file = new File(['x'], 'thanh-ly.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Văn bản chấm dứt / thanh lý hợp đồng'), {
      target: { files: [file] },
    });
    const buttons = screen.getAllByRole('button', { name: 'Chấm dứt hồ sơ' });
    fireEvent.click(buttons[buttons.length - 1]!);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      '/api/enforcement-cases/c1/termination-file?reason=NO_CONDITIONS&basis=%C4%90i%E1%BB%81u+46+Lu%E1%BA%ADt+THADS&outcome=%C4%90%C3%A3+b%C3%A1o+%C4%91%C6%B0%C6%A1ng+s%E1%BB%B1',
    );
    expect((init as RequestInit).headers).toEqual({ 'content-type': 'application/pdf' });
  });

  it('từ chối định dạng tệp không được phép', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok());
    render(<TerminationSheet caseId="c1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Chấm dứt hồ sơ' }));
    fireEvent.change(screen.getByLabelText('Căn cứ pháp lý'), { target: { value: 'x' } });
    fireEvent.change(screen.getByLabelText('Văn bản chấm dứt / thanh lý hợp đồng'), {
      target: { files: [new File(['x'], 'a.exe', { type: 'application/x-msdownload' })] },
    });
    const buttons = screen.getAllByRole('button', { name: 'Chấm dứt hồ sơ' });
    fireEvent.click(buttons[buttons.length - 1]!);
    expect(await screen.findByText('Chỉ nhận PDF, JPEG hoặc PNG')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
