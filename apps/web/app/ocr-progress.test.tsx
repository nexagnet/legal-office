import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OcrProgress } from '../components/OcrProgress';
import { ocrApplies, ocrIsActive, ocrLabel, ocrPercent } from '../lib/ocr-progress';

const row = (status: string | null, done: number | null, total: number | null) => ({
  status: status as never,
  done,
  total,
});

describe('tiến độ OCR (tài liệu mới)', () => {
  it('tính phần trăm và chữ hiển thị', () => {
    expect(ocrPercent(row('RUNNING', 1, 4))).toBe(25);
    expect(ocrPercent(row('RUNNING', 0, null))).toBeNull();
    expect(ocrPercent(row('RUNNING', 9, 4))).toBe(100);
    expect(ocrPercent(row('DONE', null, null))).toBe(100);
    expect(ocrLabel(row('RUNNING', 2, 4))).toBe('Đang OCR 2/4 trang');
    expect(ocrLabel(row('RUNNING', null, null))).toBe('Đang OCR…');
    expect(ocrLabel(row('PENDING', null, null))).toBe('Chờ OCR');
    expect(ocrLabel(row(null, null, null))).toBe('Chờ OCR');
    expect(ocrLabel(row('FAILED', null, null))).toBe('OCR lỗi');
    expect(ocrLabel(row('DONE', 3, 3))).toBe('OCR xong');
  });

  it('chỉ PDF và ảnh được OCR; chỉ trạng thái chưa kết thúc mới cần hỏi tiếp', () => {
    expect(ocrApplies('application/pdf')).toBe(true);
    expect(ocrApplies('image/png')).toBe(true);
    expect(ocrApplies('application/msword')).toBe(false);
    expect(ocrIsActive(null)).toBe(true);
    expect(ocrIsActive('PENDING')).toBe(true);
    expect(ocrIsActive('RUNNING')).toBe(true);
    for (const s of ['DONE', 'FAILED', 'SKIPPED'] as const) expect(ocrIsActive(s)).toBe(false);
  });
});

describe('OcrProgress', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const reply = (status: string, done: number, total: number) =>
    ({
      ok: true,
      json: async () => ({
        rows: [{ ocr_status: status, ocr_pages_done: done, ocr_pages_total: total }],
      }),
    }) as Response;

  it('hỏi định kỳ, cập nhật % rồi dừng khi xong', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply('RUNNING', 1, 4))
      .mockResolvedValueOnce(reply('DONE', 4, 4));
    vi.stubGlobal('fetch', fetchMock);
    render(<OcrProgress fileId="f1" initial={row('PENDING', null, null)} />);
    expect(screen.getByText('Chờ OCR')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(screen.getByText('Đang OCR 1/4 trang')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('25');
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/dms/files/ocr-status?ids=f1');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByText('OCR xong')).toBeTruthy();
    const calls = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchMock.mock.calls.length).toBe(calls); // đã dừng
  });

  it('tệp đã xong hoặc lỗi từ đầu thì không hỏi gì', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<OcrProgress fileId="f2" initial={row('FAILED', null, null)} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(screen.getByText('OCR lỗi')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lỗi mạng liên tiếp thì ngừng hỏi, không treo trang', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('net'));
    vi.stubGlobal('fetch', fetchMock);
    render(<OcrProgress fileId="f3" initial={row('RUNNING', 0, 2)} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    expect(fetchMock.mock.calls.length).toBe(5);
  });

  it('OCR lỗi: có quyền thì hiện nút Thử lại OCR, bấm gọi API rồi quay về chờ và hỏi tiếp', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 'OCR_RETRY_QUEUED' }),
      } as Response)
      .mockResolvedValue(reply('RUNNING', 1, 4));
    vi.stubGlobal('fetch', fetchMock);
    render(<OcrProgress fileId="f4" initial={row('FAILED', null, null)} canRetry />);
    await act(async () => {
      screen.getByRole('button', { name: 'Thử lại OCR' }).click();
      await vi.advanceTimersByTimeAsync(0);
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('/api/dms/files/f4/ocr-retry');
    expect((init as RequestInit).method).toBe('POST');
    expect(screen.getByText('Chờ OCR')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Thử lại OCR' })).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(screen.getByText('Đang OCR 1/4 trang')).toBeTruthy();
  });

  it('OCR lỗi nhưng không có quyền thì không có nút; máy chủ từ chối thì báo lỗi và giữ trạng thái lỗi', async () => {
    cleanup();
    render(<OcrProgress fileId="f5" initial={row('FAILED', null, null)} />);
    expect(screen.queryByRole('button', { name: 'Thử lại OCR' })).toBeNull();
    cleanup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ code: 'PERMISSION_DENIED' }),
      } as Response),
    );
    render(<OcrProgress fileId="f6" initial={row('FAILED', null, null)} canRetry />);
    await act(async () => {
      screen.getByRole('button', { name: 'Thử lại OCR' }).click();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('OCR lỗi')).toBeTruthy();
  });
});
