// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReturnedToggle } from '../components/ReturnedToggle';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const reply = (status: number, body: object) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

describe('ReturnedToggle (ô "Đã trả kết quả", N2)', () => {
  it('tích gọi API đúng đường dẫn và thân, giữ trạng thái đã tích', async () => {
    const fetchMock = vi.fn(() => reply(200, { code: 'CASE_RETURNED_SET', label: null }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ReturnedToggle caseId="c1" initial={false} editable caseLabel="030/2026/VB-THV" />);
    const box = screen.getByRole('checkbox', { name: 'Đã trả kết quả hồ sơ 030/2026/VB-THV' });
    fireEvent.click(box);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/dms/cases/c1/returned');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ returned: true });
    await waitFor(() => expect((box as HTMLInputElement).checked).toBe(true));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('bị từ chối thì hoàn lại ô tích và báo lỗi tiếng Việt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => reply(403, { code: 'ROLE_LACKS_PERMISSION', label: null })),
    );
    render(<ReturnedToggle caseId="c1" initial={false} editable caseLabel="HS" />);
    const box = screen.getByRole('checkbox') as HTMLInputElement;
    fireEvent.click(box);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(box.checked).toBe(false);
    expect(screen.getByRole('alert').textContent).toContain('Vai trò của bạn');
  });

  it('không có quyền hoặc hồ sơ chưa ghi sổ thì chỉ xem, không gọi API', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<ReturnedToggle caseId="c1" initial editable={false} caseLabel="HS" />);
    const box = screen.getByRole('checkbox') as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
