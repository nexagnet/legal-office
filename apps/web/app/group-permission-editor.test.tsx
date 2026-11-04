import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GroupPermissionEditor } from '../components/permissions/GroupPermissionEditor';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('GroupPermissionEditor', () => {
  it('chưa đổi gì thì không cho lưu', () => {
    render(<GroupPermissionEditor groupId="g1" permissions={['vibang.read.all']} />);
    const save = screen.getByRole('button', { name: 'Lưu quyền của nhóm' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
  });

  it('bỏ một quyền thì gửi một thay đổi REVOKE tới /changes cùng lý do', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(new Response('{"code":"OK"}', { status: 200 })));
    render(<GroupPermissionEditor groupId="g1" permissions={['vibang.read.all']} />);
    fireEvent.click(screen.getAllByRole('checkbox', { checked: true })[0]!);
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Thu hẹp quyền' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu quyền của nhóm' }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(String(spy.mock.calls[0]![0])).toBe('/api/dms/groups/g1/changes');
    expect(JSON.parse(String((spy.mock.calls[0]![1] as RequestInit).body))).toEqual({
      kind: 'REVOKE',
      permission: 'vibang.read.all',
      reason: 'Thu hẹp quyền',
    });
  });

  it('thiếu lý do thì không gửi', () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    render(<GroupPermissionEditor groupId="g1" permissions={['vibang.read.all']} />);
    fireEvent.click(screen.getAllByRole('checkbox', { checked: true })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu quyền của nhóm' }));
    expect(spy).not.toHaveBeenCalled();
  });
});
