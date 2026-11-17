import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let search = 'a=1';
vi.mock('next/navigation', () => ({
  usePathname: () => '/dms/vibang',
  useSearchParams: () => new URLSearchParams(search),
}));

import { DmsFilterNavBusy } from '../components/DmsFilterNavBusy';

afterEach(() => {
  cleanup();
  search = 'a=1';
  window.history.pushState({}, '', '/dms/vibang?a=1');
});

window.history.pushState({}, '', '/dms/vibang?a=1');
const ui = () => (
  <section className="dms-list">
    <DmsFilterNavBusy />
    <a href="/dms/vibang?a=2">Chip</a>
    <a href="/dms/vibang/abc">Chi tiết</a>
    <form method="get" action="/dms/vibang">
      <button type="submit">Áp dụng</button>
    </form>
  </section>
);

describe('DmsFilterNavBusy', () => {
  it('bấm chip cùng trang thì báo bận, địa chỉ đổi thì tắt', () => {
    vi.useFakeTimers();
    const { container, getByText, rerender } = render(ui());
    const root = container.querySelector('.dms-list')!;
    fireEvent.click(getByText('Chip'));
    expect(root.getAttribute('data-busy')).toBe('true');
    search = 'a=2';
    rerender(ui());
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(root.hasAttribute('data-busy')).toBe(false);
    vi.useRealTimers();
  });
  it('vẫn báo bận khi liên kết tự chặn mặc định như <Link> của Next', () => {
    const { container, getByText } = render(ui());
    const a = getByText('Chip');
    a.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(a);
    expect(container.querySelector('.dms-list')!.getAttribute('data-busy')).toBe('true');
  });
  it('địa chỉ đổi rất nhanh vẫn giữ hiệu ứng đủ lâu để thấy', () => {
    vi.useFakeTimers();
    try {
      const { container, getByText, rerender } = render(ui());
      const root = container.querySelector('.dms-list')!;
      fireEvent.click(getByText('Chip'));
      search = 'a=2';
      rerender(ui());
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(root.getAttribute('data-busy')).toBe('true');
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(root.hasAttribute('data-busy')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  it('liên kết sang trang khác không báo bận', () => {
    const { container, getByText } = render(ui());
    fireEvent.click(getByText('Chi tiết'));
    expect(container.querySelector('.dms-list')!.hasAttribute('data-busy')).toBe(false);
  });
  it('gửi biểu mẫu GET thì báo bận', () => {
    const { container, getByText } = render(ui());
    act(() => {
      fireEvent.submit(getByText('Áp dụng').closest('form')!);
    });
    expect(container.querySelector('.dms-list')!.getAttribute('data-busy')).toBe('true');
  });
});
