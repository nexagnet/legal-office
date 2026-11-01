import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GroupWizard } from '../components/permissions/GroupWizard';
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
    id: 'tpl',
    name: 'Thư ký',
    kind: 'TEMPLATE',
    status: 'ACTIVE',
    version: 2,
    member_ids: [],
    permissions: ['vibang.read.own', 'vibang.draft.own', 'dms.permission.approve'],
  },
];

const reply = (body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
const calls = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map(([url, init]) => [
    String(url),
    JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>,
  ]);

describe('GroupWizard (Figma P4/P5)', () => {
  it('bắt buộc tên, không trùng tên nhóm đã có', () => {
    render(<GroupWizard officeId="o1" groups={groups} />);
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục: chọn quyền/ }));
    expect(screen.getByRole('alert').textContent).toContain('Hãy đặt tên nhóm');
    fireEvent.change(screen.getByLabelText('Tên nhóm'), { target: { value: 'Thư ký' } });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục: chọn quyền/ }));
    expect(screen.getByRole('alert').textContent).toContain('Tên nhóm đã có');
  });

  it('sao chép không mang quyền dành riêng và báo số quyền bị bỏ qua', () => {
    render(<GroupWizard officeId="o1" groups={groups} />);
    fireEvent.click(screen.getByRole('radio', { name: /Sao chép: Thư ký/ }));
    expect(screen.getByText('Sao chép 2 quyền')).toBeTruthy();
    expect(screen.getByText('Không sao chép 1 quyền dành riêng')).toBeTruthy();
  });

  it('nhóm trống: tạo nhóm rồi mỗi quyền đã chọn là một đề xuất GRANT cùng lý do', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((url) =>
        reply(
          String(url).endsWith('/dms/groups')
            ? { code: 'GROUP_CREATED', label: 'g-new' }
            : { code: 'REQUEST_CREATED' },
        ),
      );
    render(<GroupWizard officeId="o1" groups={groups} />);
    fireEvent.change(screen.getByLabelText('Tên nhóm'), { target: { value: 'Thực tập sinh' } });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục: chọn quyền/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Xem hồ sơ · Vi bằng/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tiếp: xem trước/ }));
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Mùa tập sự' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/quan-tri/phan-quyen/nhom/g-new'));
    expect(calls(spy)).toEqual([
      ['/api/dms/groups', { officeId: 'o1', name: 'Thực tập sinh' }],
      [
        '/api/dms/groups/g-new/requests',
        { kind: 'GRANT', permission: 'vibang.read.own', reason: 'Mùa tập sự' },
      ],
    ]);
  });

  it('có quyền được chọn mà thiếu lý do thì không gọi máy chủ', () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    render(<GroupWizard officeId="o1" groups={groups} />);
    fireEvent.change(screen.getByLabelText('Tên nhóm'), { target: { value: 'Mới' } });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục: chọn quyền/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Xem hồ sơ · Vi bằng/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tiếp: xem trước/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi duyệt' }));
    expect(screen.getByRole('alert').textContent).not.toBe('');
    expect(spy).not.toHaveBeenCalled();
  });
});
