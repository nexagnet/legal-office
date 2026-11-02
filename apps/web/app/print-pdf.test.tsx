import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PdfPrintButton } from '../components/PdfPrintButton';
import { fetchPdfBlob, printPdfBlob } from '../lib/print-pdf';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.querySelectorAll('iframe').forEach((f) => f.remove());
});

function stubObjectUrl() {
  Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:pdf-1'),
    revokeObjectURL: vi.fn(),
  });
}

describe('in PDF bằng hộp thoại in của trình duyệt', () => {
  it('nạp PDF vào iframe ẩn rồi gọi print() khi iframe tải xong', () => {
    vi.useFakeTimers();
    stubObjectUrl();
    printPdfBlob(new Blob(['%PDF-'], { type: 'application/pdf' }));
    const frame = document.querySelector('iframe')!;
    expect(frame.getAttribute('aria-hidden')).toBe('true');
    expect(frame.src).toBe('blob:pdf-1');
    const print = vi.fn();
    Object.defineProperty(frame, 'contentWindow', { value: { focus: vi.fn(), print } });
    frame.dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(200);
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('không in được trong iframe thì mở PDF ở tab mới', () => {
    vi.useFakeTimers();
    stubObjectUrl();
    const open = vi.fn();
    vi.stubGlobal('open', open);
    printPdfBlob(new Blob(['%PDF-']));
    const frame = document.querySelector('iframe')!;
    Object.defineProperty(frame, 'contentWindow', {
      value: {
        focus: vi.fn(),
        print: () => {
          throw new Error('blocked');
        },
      },
    });
    frame.dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(200);
    expect(open).toHaveBeenCalledWith('blob:pdf-1', '_blank', 'noopener');
  });

  it('API trả lỗi thì ném lỗi', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('x', { status: 403 })),
    );
    await expect(fetchPdfBlob('/api/x')).rejects.toThrow('pdf-403');
  });

  it('nút lấy PDF từ API rồi mở iframe in; lỗi thì báo', async () => {
    stubObjectUrl();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('%PDF-', { status: 200 }))
      .mockResolvedValueOnce(new Response('no', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<PdfPrintButton url="/api/dms/books/VT-DEN?format=pdf" />);
    fireEvent.click(screen.getByRole('button', { name: 'Xuất PDF để in' }));
    await waitFor(() => expect(document.querySelector('iframe')).not.toBeNull());
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/dms/books/VT-DEN?format=pdf');
    fireEvent.click(screen.getByRole('button', { name: 'Xuất PDF để in' }));
    await screen.findByText('Không dựng được PDF. Thử lại.');
  });
});
