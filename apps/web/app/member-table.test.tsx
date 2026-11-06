import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BranchManager } from '../components/BranchManager';
import { MemberTable, type MemberRow } from '../components/MemberTable';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);

const row = (
  userId: string,
  name: string,
  email: string,
  state: MemberRow['state'],
  groupNames: string[] = [],
): MemberRow => ({
  userId,
  name,
  email,
  branches: [],
  isAdmin: false,
  state,
  groupNames,
  pending: false,
  legacyRole: null,
  suspended: state === 'suspended',
});

describe('MemberTable', () => {
  const members = [
    row('1', 'Nguyễn Đức An', 'an@x.vn', 'active', ['Văn thư chi nhánh']),
    row('2', 'Lê Thị Bình', 'binh@x.vn', 'active', ['Kế toán', 'Thư ký']),
  ];

  it('hiện nhóm quyền từng người và liên kết tới quyền hiệu lực', () => {
    render(<MemberTable members={members} />);
    expect(screen.getByText('Kế toán + Thư ký')).toBeTruthy();
    const links = screen.getAllByRole('link', { name: /Xem quyền hiệu lực/ });
    expect(links[0]?.getAttribute('href')).toBe('/quan-tri/phan-quyen/nguoi-dung/1');
    expect(screen.queryByText('Quyền ký')).toBeNull();
  });

  it('tìm không dấu theo tên và email', () => {
    render(<MemberTable members={members} />);
    fireEvent.change(screen.getByLabelText('Tìm thành viên'), { target: { value: 'duc an' } });
    expect(screen.getByText('Nguyễn Đức An')).toBeTruthy();
    expect(screen.queryByText('Lê Thị Bình')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('1/2 thành viên');
  });

  it('lọc Tạm khóa: hiện đúng người bị khóa, không còn quyền hiệu lực', () => {
    render(
      <MemberTable
        members={[...members, row('4', 'Đã Khóa', 'khoa@x.vn', 'suspended', ['Kế toán'])]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Tạm khóa 1/ }));
    expect(screen.getByText('Đã Khóa')).toBeTruthy();
    expect(screen.queryByText('Nguyễn Đức An')).toBeNull();
    expect(screen.getByText('Không còn quyền hiệu lực')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Chưa có quyền/ }));
    expect(screen.queryByText('Đã Khóa')).toBeNull();
  });

  it('lọc theo trạng thái Chưa có quyền', () => {
    render(<MemberTable members={[...members, row('3', 'Mới Vào', 'moi@x.vn', 'no-access')]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Chưa có quyền 1' }));
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
    expect(screen.getByText('3 người')).toBeTruthy();
  });
});
