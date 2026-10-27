import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NavPending } from '../components/NavPending';

const status = vi.hoisted(() => ({ pending: false }));
vi.mock('next/link', () => ({ useLinkStatus: () => status }));

describe('NavPending', () => {
  it('chỉ hiện vòng quay khi liên kết đang chuyển trang', () => {
    status.pending = false;
    const { rerender } = render(<NavPending />);
    expect(screen.queryByRole('status')).toBeNull();
    status.pending = true;
    rerender(<NavPending />);
    expect(screen.getByRole('status', { name: 'Đang chuyển trang' })).toBeTruthy();
  });
});
