import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePendingCount, usePendingApprovals } from '../components/usePendingApprovals';

afterEach(() => vi.unstubAllGlobals());

describe('parsePendingCount', () => {
  it('đếm số đề xuất chờ duyệt', () => {
    expect(parsePendingCount([{}, {}, {}])).toBe(3);
  });
  it('trả null khi phản hồi lạ', () => {
    expect(parsePendingCount({ x: 1 })).toBeNull();
    expect(parsePendingCount(null)).toBeNull();
  });
});

describe('usePendingApprovals', () => {
  it('nạp số chờ duyệt ở trình duyệt sau khi hiện trang', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{}, {}])));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => usePendingApprovals('o1', '/'));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(2));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/approvals/pending?officeId=o1',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });
  it('không gọi API khi không có officeId và giữ null khi lỗi', async () => {
    const fetchMock = vi.fn(async () => new Response('x', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => usePendingApprovals(undefined, '/'));
    expect(fetchMock).not.toHaveBeenCalled();
    const { result } = renderHook(() => usePendingApprovals('o1', '/'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
