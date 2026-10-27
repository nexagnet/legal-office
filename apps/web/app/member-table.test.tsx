import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BranchManager } from '../components/BranchManager';
import { MemberTable, type MemberRow } from '../components/MemberTable';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);

const row = (
  userId: string,
  label: string,
  role: string | null,
  branches: string[],
): MemberRow => ({
  userId,
  label,
  role,
  legalSigner: false,
  hasLogin: true,
  branches,
  pending: false,
});

describe('MemberTable', () => {
  const members = [
    row('1', 'Nguyễn Đức An (an@x.vn)', 'ADMIN', []),
    row('2', 'Lê Thị Bình (binh@x.vn)', 'VAN_THU', ['Hà Nội']),
  ];

  it('tìm không dấu theo tên và email', () => {
    render(<MemberTable members={members} />);
    fireEvent.change(screen.getByLabelText('Tìm thành viên'), { target: { value: 'duc an' } });
    expect(screen.getByText('Nguyễn Đức An')).toBeTruthy();
    expect(screen.queryByText('Lê Thị Bình')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('1/2 thành viên');
  });

  it('lọc theo trạng thái Chưa có vai', () => {
    render(<MemberTable members={[...members, row('3', 'Mới Vào (moi@x.vn)', null, [])]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Chưa có vai 1' }));
    expect(screen.queryByText('Lê Thị Bình')).toBeNull();
    expect(screen.getByText('Mới Vào')).toBeTruthy();
  });
});

describe('BranchManager', () => {
  it('hiện số thành viên từng địa điểm', () => {
    render(
      <BranchManager
        officeId="o"
        branches={[{ id: 'b', officeId: 'o', name: 'Hà Nội' } as never]}
        memberCounts={{ 'Hà Nội': 3 }}
      />,
    );
    expect(screen.getByText('3 thành viên được cấp')).toBeTruthy();
  });
});
