import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import ErrorPage from './error';
import NotFound from './not-found';
import { StateCard } from '../components/ui/state-card';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe('Trang trạng thái (Figma S1, N19 A1)', () => {
  it('404 có tiêu đề, mô tả và đường về Tổng quan', () => {
    render(<NotFound />);
    expect(screen.getByRole('heading', { name: 'Không tìm thấy' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Về Tổng quan' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('lỗi bất ngờ là cảnh báo và cho tải lại', () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error('x')} reset={reset} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại' }));
    expect(reset).toHaveBeenCalled();
  });

  it('thẻ trạng thái chỉ là alert khi được yêu cầu', () => {
    render(<StateCard mark="403" title="Không có quyền truy cập" description="Liên hệ Admin." />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
