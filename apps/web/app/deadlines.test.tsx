import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalendarSettings } from '../components/CalendarSettings';
import { DeadlineReminders } from '../components/DeadlineReminders';
import { DEADLINE_DOMAIN_LABEL, deadlineHref, type DeadlineItem } from '../lib/deadlines';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockClear();
});

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const item = (over: Partial<DeadlineItem>): DeadlineItem => ({
  domain: 'VIBANG_CSDL',
  refId: 'r1',
  caseId: 'case-1',
  label: 'Cập nhật CSDL hồ sơ A',
  deadlineAt: '2026-10-20T03:00:00Z',
  status: 'PENDING',
  overdue: false,
  ...over,
});

describe('DeadlineReminders', () => {
  it('flags overdue rows with text and links to the right screen', () => {
    render(
      <DeadlineReminders
        items={[
          item({ overdue: true, label: 'Quá A', caseId: 'c9' }),
          item({ refId: 'r2', domain: 'TONG_DAT', label: 'Tống đạt B' }),
        ]}
      />,
    );
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[0]!).getByText('Quá hạn')).toBeTruthy();
    expect(within(rows[0]!).getByText('Vi bằng · cập nhật CSDL')).toBeTruthy();
    expect(within(rows[0]!).getByRole('link', { name: 'Quá A' }).getAttribute('href')).toBe(
      '/vi-bang/c9',
    );
    expect(within(rows[1]!).getByText('Sắp đến hạn')).toBeTruthy();
    expect(within(rows[1]!).getByRole('link', { name: 'Tống đạt B' }).getAttribute('href')).toBe(
      '/tong-dat',
    );
    expect(within(rows[1]!).getByText('Hạn 20/10/2026')).toBeTruthy();
  });
  it('says honestly when there is nothing to remind', () => {
    render(<DeadlineReminders items={[]} />);
    expect(screen.getByRole('status').textContent).toContain('Không có hạn cần nhắc');
  });
  it('shows an error state instead of an empty list when the API failed', () => {
    render(<DeadlineReminders items="error" />);
    expect(screen.getByRole('alert').textContent).toContain('Không tải được nhắc hạn');
  });
  it('labels and links official letters to their list', () => {
    expect(deadlineHref({ domain: 'CONG_VAN', caseId: 'x' })).toBe('/cong-van');
    expect(DEADLINE_DOMAIN_LABEL.CONG_VAN).toBe('Công văn');
  });
  it('has no link for an unknown domain', () => {
    expect(deadlineHref({ domain: 'KHAC', caseId: 'x' })).toBeNull();
  });
});

describe('CalendarSettings', () => {
  const cal = {
    workingWeekdays: [1, 2, 3, 4, 5],
    holidays: [{ day: '2026-09-02', label: 'Quốc khánh' }],
  };
  const setup = (canEdit = true) =>
    render(<CalendarSettings officeId="o-1" calendar={cal} canEdit={canEdit} />);
  const body = (spy: ReturnType<typeof vi.spyOn>, n = 0) =>
    JSON.parse((spy.mock.calls[n]![1] as RequestInit).body as string);

  it('shows Mon-Fri checked, Saturday off, and the advisory note', () => {
    setup();
    expect((screen.getByLabelText('Thứ Hai') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Thứ Bảy') as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(/Thứ Bảy mặc định không phải ngày làm việc/)).toBeTruthy();
    expect(screen.getByText(/Hạn chỉ là nhắc việc/)).toBeTruthy();
  });

  it('saves toggled weekdays with PUT', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply(200, {}));
    setup();
    fireEvent.click(screen.getByLabelText('Thứ Bảy'));
    fireEvent.click(screen.getByLabelText('Thứ Sáu'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu ngày làm việc' }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/office/calendar/weekdays');
    expect((init as RequestInit).method).toBe('PUT');
    expect(body(spy)).toEqual({ officeId: 'o-1', weekdays: [1, 2, 3, 4, 6] });
    expect((await screen.findByText('Đã lưu ngày làm việc.')).textContent).toBeTruthy();
  });

  it('adds a holiday with the right endpoint and body', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply(200, {}));
    setup();
    fireEvent.change(screen.getByLabelText('Ngày nghỉ'), { target: { value: '2026-10-10' } });
    fireEvent.change(screen.getByLabelText('Tên ngày nghỉ'), { target: { value: 'Giỗ Tổ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm ngày nghỉ' }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0]![0]).toBe('/api/office/calendar/holidays');
    expect(body(spy)).toEqual({ officeId: 'o-1', day: '2026-10-10', label: 'Giỗ Tổ' });
    expect(await screen.findByText(/Giỗ Tổ/)).toBeTruthy();
  });

  it('removes a holiday with the right endpoint and body', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply(200, {}));
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Xoá ngày nghỉ Quốc khánh' }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0]![0]).toBe('/api/office/calendar/holidays/remove');
    expect(body(spy)).toEqual({ officeId: 'o-1', day: '2026-09-02' });
    await waitFor(() => expect(screen.queryByText(/Quốc khánh/)).toBeNull());
  });

  it('shows the Vietnamese message for ADMIN_ONLY and keeps the list unchanged', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply(403, { code: 'ADMIN_ONLY' }));
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Xoá ngày nghỉ Quốc khánh' }));
    expect((await screen.findByText('Chỉ Admin được thực hiện thao tác này.')).textContent).toBe(
      'Chỉ Admin được thực hiện thao tác này.',
    );
    expect(screen.getByText(/Quốc khánh/)).toBeTruthy();
  });

  it('computes a trial deadline via GET', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { dueDate: '2026-10-23' }));
    setup();
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-10-16' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tính hạn' }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const url = String(spy.mock.calls[0]![0]);
    expect(url).toContain('/api/office/deadlines/compute?');
    expect(url).toContain('officeId=o-1');
    expect(url).toContain('from=2026-10-16');
    expect(url).toContain('days=5');
    expect((await screen.findByText(/Hạn dự kiến: 23\/10\/2026/)).textContent).toBeTruthy();
  });

  it('is read-only for non-admins', () => {
    setup(false);
    expect(screen.queryByRole('button', { name: 'Lưu ngày làm việc' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Xoá ngày nghỉ/ })).toBeNull();
    expect(screen.getByLabelText('Thứ Hai').matches(':disabled')).toBe(true);
  });
});
