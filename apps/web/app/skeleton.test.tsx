import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DashboardSkeleton, DetailSkeleton, ListSkeleton } from '../components/skeleton';

afterEach(cleanup);

describe('khung chờ', () => {
  it('danh sách: tiêu đề thật, báo trạng thái đang tải, đủ hàng giữ chỗ', () => {
    const { container } = render(<ListSkeleton title="Vi bằng" rows={5} cols={4} />);
    expect(screen.getByRole('heading', { name: 'Vi bằng' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Đang tải danh sách…');
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
    expect(container.querySelectorAll('tbody tr:first-child td')).toHaveLength(4);
  });
  it('chi tiết hồ sơ: sáu bước tiến độ và hai cột', () => {
    const { container } = render(<DetailSkeleton />);
    expect(screen.getByRole('status').textContent).toBe('Đang tải hồ sơ…');
    expect(container.querySelectorAll('.sk-step')).toHaveLength(6);
    expect(container.querySelectorAll('.sk-card')).toHaveLength(2);
  });
  it('tổng quan: bốn thẻ số liệu', () => {
    const { container } = render(<DashboardSkeleton />);
    expect(container.querySelectorAll('.kpi')).toHaveLength(4);
  });
});
