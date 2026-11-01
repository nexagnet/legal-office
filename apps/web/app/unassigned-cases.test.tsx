import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnassignedCasesSection } from '../components/permissions/UnassignedCasesSection';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockClear();
});

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const branches = [
  { id: 'b1', name: 'Chi nhánh 1' },
  { id: 'b2', name: 'Chi nhánh 2' },
];
const cases = [
  {
    id: 'c1',
    domain: 'vibang',
    title: 'Vi bằng cũ 1',
    status: 'RECORDED',
    createdAt: '2026-05-01T00:00:00Z',
  },
  {
    id: 'c2',
    domain: 'tongdat',
    title: 'Tống đạt cũ 2',
    status: 'RECORDED',
    createdAt: '2026-05-02T00:00:00Z',
  },
];

describe('UnassignedCasesSection (hồ sơ chưa gắn chi nhánh)', () => {
  it('không hiện gì khi không còn hồ sơ chưa gắn chi nhánh', () => {
    const { container } = render(
      <UnassignedCasesSection officeId="o1" branches={branches} cases={[]} total={0} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('chọn hồ sơ rồi gắn một chi nhánh cho cả nhóm', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'BRANCH_ASSIGNED' }));
    render(<UnassignedCasesSection officeId="o1" branches={branches} cases={cases} total={2} />);
    expect(
      (screen.getByRole('button', { name: /Gắn chi nhánh \(0\)/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByLabelText('Chọn tất cả hồ sơ'));
    fireEvent.change(screen.getByLabelText('Gắn vào chi nhánh'), { target: { value: 'b2' } });
    fireEvent.click(screen.getByRole('button', { name: /Gắn chi nhánh \(2\)/ }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0]![0]).toBe('/api/dms/cases-without-branch/assign');
    expect(JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      officeId: 'o1',
      caseIds: ['c1', 'c2'],
      branchId: 'b2',
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect((await screen.findByRole('status')).textContent).toBe('Đã gắn chi nhánh cho 2 hồ sơ.');
  });

  it('báo lỗi bằng tiếng Việt khi máy chủ từ chối', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      reply(422, { code: 'CASE_NOT_UNASSIGNED' }),
    );
    render(<UnassignedCasesSection officeId="o1" branches={branches} cases={cases} total={2} />);
    fireEvent.click(screen.getByLabelText('Chọn Vi bằng cũ 1'));
    fireEvent.change(screen.getByLabelText('Gắn vào chi nhánh'), { target: { value: 'b1' } });
    fireEvent.click(screen.getByRole('button', { name: /Gắn chi nhánh \(1\)/ }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'đã được gắn chi nhánh từ trước',
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
