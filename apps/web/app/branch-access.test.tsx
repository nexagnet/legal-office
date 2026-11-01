import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BranchAccessSection } from '../components/permissions/BranchAccessSection';
import { NewDmsCaseForm } from '../components/NewDmsCaseForm';

const refresh = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockClear();
  push.mockClear();
});

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const bodyOf = (spy: ReturnType<typeof vi.spyOn>, i = 0) =>
  JSON.parse((spy.mock.calls[i]![1] as RequestInit).body as string) as Record<string, unknown>;

const branches = [
  { id: 'b1', name: 'Chi nhánh 1' },
  { id: 'b2', name: 'Chi nhánh 2' },
];

describe('BranchAccessSection (phạm vi theo chi nhánh)', () => {
  const base = { officeId: 'o1', userId: 'u1', branches, canEdit: true, seesAll: false } as const;

  it('liệt kê chi nhánh đã cấp, đánh dấu cấp theo vai cũ và chỉ cho thu hồi nguồn mới', () => {
    render(
      <BranchAccessSection
        {...base}
        granted={[
          { userId: 'u1', branchId: 'b1', branchName: 'Chi nhánh 1', source: 'DMS' },
          { userId: 'u1', branchId: 'b2', branchName: 'Chi nhánh 2', source: 'LEGACY' },
        ]}
      />,
    );
    expect(screen.getByText('Chi nhánh 1')).toBeTruthy();
    expect(screen.getByText(/Chi nhánh 2 · cấp theo vai cũ/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Thu hồi', hidden: true })).toHaveLength(1); // chỉ nguồn DMS có nút thu hồi
    expect(screen.queryByRole('button', { name: 'Cấp chi nhánh' })).toBeNull();
  });

  it('chưa cấp chi nhánh nào: cảnh báo và cho cấp; cấp gửi đúng nội dung rồi làm mới trang', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'BRANCH_ACCESS_GRANTED' }));
    render(<BranchAccessSection {...base} granted={[]} />);
    expect(screen.getByText('Chưa được cấp chi nhánh nào.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Chi nhánh', { selector: 'select' }), {
      target: { value: 'b2' },
    });
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Phân công' } });
    fireEvent.submit(screen.getByLabelText('Lý do').closest('form')!);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(spy.mock.calls[0]![0]).toBe('/api/dms/branch-access');
    expect(bodyOf(spy)).toEqual({
      officeId: 'o1',
      userId: 'u1',
      branchId: 'b2',
      granted: true,
      reason: 'Phân công',
    });
  });

  it('thu hồi gửi granted=false kèm lý do; lỗi hiện bằng tiếng Việt', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(409, { code: 'NO_CHANGE' }));
    render(
      <BranchAccessSection
        {...base}
        granted={[{ userId: 'u1', branchId: 'b1', branchName: 'Chi nhánh 1', source: 'DMS' }]}
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Thu hồi', hidden: true })[0]!);
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Chuyển công tác' } });
    fireEvent.submit(screen.getByLabelText('Lý do').closest('form')!);
    await waitFor(() =>
      expect(screen.getByRole('alert', { hidden: true }).textContent).toContain(
        'Không có gì thay đổi',
      ),
    );
    expect(bodyOf(spy)).toMatchObject({
      branchId: 'b1',
      granted: false,
      reason: 'Chuyển công tác',
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('người xem không có quyền sửa không thấy nút; Admin xem mọi chi nhánh; văn phòng chưa có chi nhánh', () => {
    const { unmount } = render(<BranchAccessSection {...base} canEdit={false} granted={[]} />);
    expect(screen.queryByRole('button', { name: 'Cấp chi nhánh' })).toBeNull();
    unmount();
    const a = render(<BranchAccessSection {...base} seesAll granted={[]} />);
    expect(screen.getByText('Mọi chi nhánh')).toBeTruthy();
    a.unmount();
    render(<BranchAccessSection {...base} branches={[]} granted={[]} />);
    expect(screen.getByText(/chưa có chi nhánh nào/)).toBeTruthy();
  });
});

describe('NewDmsCaseForm chọn chi nhánh', () => {
  it('nhiều chi nhánh: bắt chọn và gửi branchId', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((url) =>
        String(url).includes('/me/branches')
          ? reply(200, { rows: branches })
          : reply(200, { code: 'CASE_DRAFT_CREATED', label: 'c1' }),
      );
    render(<NewDmsCaseForm officeId="o1" domainCode="vibang" />);
    const select = await screen.findByLabelText('Chi nhánh', { selector: 'select' });
    fireEvent.change(select, { target: { value: 'b2' } });
    fireEvent.change(screen.getByLabelText('Tên hồ sơ'), { target: { value: 'A' } });
    fireEvent.submit(screen.getByLabelText('Tên hồ sơ').closest('form')!);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(bodyOf(spy, 1)).toMatchObject({ officeId: 'o1', domain: 'vibang', branchId: 'b2' });
  });

  it('một chi nhánh: không hiện ô chọn, không gửi branchId (máy chủ tự gắn)', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((url) =>
        String(url).includes('/me/branches')
          ? reply(200, { rows: [branches[0]] })
          : reply(200, { code: 'CASE_DRAFT_CREATED', label: 'c1' }),
      );
    render(<NewDmsCaseForm officeId="o1" domainCode="vibang" />);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(screen.queryByLabelText('Chi nhánh', { selector: 'select' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Tên hồ sơ'), { target: { value: 'A' } });
    fireEvent.submit(screen.getByLabelText('Tên hồ sơ').closest('form')!);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(bodyOf(spy, 1)).not.toHaveProperty('branchId');
  });

  it('máy chủ đòi chọn chi nhánh thì báo bằng tiếng Việt', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) =>
      String(url).includes('/me/branches')
        ? reply(500, {})
        : reply(400, { code: 'BRANCH_REQUIRED' }),
    );
    render(<NewDmsCaseForm officeId="o1" domainCode="vibang" />);
    fireEvent.change(screen.getByLabelText('Tên hồ sơ'), { target: { value: 'A' } });
    fireEvent.submit(screen.getByLabelText('Tên hồ sơ').closest('form')!);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('chọn chi nhánh'));
  });
});
