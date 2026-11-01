import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProposeChangeForm } from '../components/permissions/ProposeChangeForm';
import type { DmsGroup } from '../lib/permission-model';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  push.mockClear();
});

const groups: DmsGroup[] = [
  {
    id: 'g1',
    name: 'Văn thư chi nhánh',
    kind: 'CUSTOM',
    status: 'ACTIVE',
    version: 3,
    member_ids: [],
    permissions: ['vtden.read.all'],
  },
];
const people = [
  { userId: 'u1', label: 'Hoàng An Nhiên · an@x.test' },
  { userId: 'u2', label: 'Ngô Thị Lan · lan@x.test' },
];

describe('ProposeChangeForm (Figma P7)', () => {
  it('chọn nhiều thành viên thì lập mỗi người một đề xuất ADD_MEMBER cùng lý do', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(new Response('{"code":"OK"}', { status: 200 })));
    render(<ProposeChangeForm groups={groups} people={people} initial={{}} />);
    const picker = screen.getByLabelText('Thêm thành viên');
    fireEvent.change(picker, { target: { value: 'u1' } });
    fireEvent.change(screen.getByLabelText('Thêm thành viên'), { target: { value: 'u2' } });
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Nhân sự mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    const bodies = spy.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(bodies).toEqual([
      { kind: 'ADD_MEMBER', userId: 'u1', reason: 'Nhân sự mới' },
      { kind: 'ADD_MEMBER', userId: 'u2', reason: 'Nhân sự mới' },
    ]);
    expect(spy.mock.calls.map(([u]) => String(u))).toEqual([
      '/api/dms/groups/g1/requests',
      '/api/dms/groups/g1/requests',
    ]);
  });

  it('chưa chọn ai thì không gửi', () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    render(<ProposeChangeForm groups={groups} people={people} initial={{}} />);
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));
    expect(screen.getByRole('alert').textContent).toContain('Hãy chọn thành viên');
    expect(spy).not.toHaveBeenCalled();
  });
});
