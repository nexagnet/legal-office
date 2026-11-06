import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalendarSettings } from '../components/CalendarSettings';
import type { OfficeCalendar } from '../lib/deadlines';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockClear();
});

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const calendar = {
  workingWeekdays: [1, 2, 3, 4, 5],
  holidays: [
    { day: '2026-09-03', label: 'Nghỉ bù Quốc khánh' },
    { day: '2026-09-02', label: 'Quốc khánh' },
  ],
} as unknown as OfficeCalendar;

const bodyOf = (spy: ReturnType<typeof vi.spyOn>, i = 0) =>
  JSON.parse((spy.mock.calls[i]![1] as RequestInit).body as string) as Record<string, unknown>;

describe('CalendarSettings (Figma Q9)', () => {
  it('hiện thứ trong tuần dạng nút bật/tắt và lưu đúng danh sách ngày làm việc', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply(200, {}));
    render(<CalendarSettings officeId="o1" calendar={calendar} canEdit />);
    expect(screen.getByRole('button', { name: 'Thứ 2' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Thứ 7' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Thứ 7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Thứ 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu lịch' }));
    await screen.findByText('Đã lưu ngày làm việc.');
    expect(spy.mock.calls[0]![0]).toBe('/api/office/calendar/weekdays');
    expect(bodyOf(spy)).toEqual({ officeId: 'o1', weekdays: [1, 3, 4, 5, 6] });
  });

  it('liệt kê ngày nghỉ theo thứ tự ngày; thêm trong hộp thoại; xoá gọi đúng API', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply(200, {}));
    render(<CalendarSettings officeId="o1" calendar={calendar} canEdit />);
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(rows[0]).toContain('Quốc khánh');
    expect(rows[1]).toContain('Nghỉ bù Quốc khánh');

    fireEvent.click(screen.getByRole('button', { name: '+ Thêm ngày nghỉ' }));
    fireEvent.change(await screen.findByLabelText('Ngày nghỉ', { selector: 'input' }), {
      target: { value: '2026-10-20' },
    });
    fireEvent.change(screen.getByLabelText('Tên ngày nghỉ'), {
      target: { value: 'Ngày nghỉ của văn phòng' },
    });
    fireEvent.submit(screen.getByLabelText('Tên ngày nghỉ').closest('form')!);
    await screen.findByText('Đã thêm ngày nghỉ.');
    expect(spy.mock.calls[0]![0]).toBe('/api/office/calendar/holidays');
    expect(bodyOf(spy)).toEqual({
      officeId: 'o1',
      day: '2026-10-20',
      label: 'Ngày nghỉ của văn phòng',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Xoá ngày nghỉ Quốc khánh' }));
    await waitFor(() => expect(spy.mock.calls[1]![0]).toBe('/api/office/calendar/holidays/remove'));
    expect(bodyOf(spy, 1)).toEqual({ officeId: 'o1', day: '2026-09-02' });
  });

  it('không có quyền sửa: không có nút thêm, xoá và lưu', () => {
    render(<CalendarSettings officeId="o1" calendar={calendar} canEdit={false} />);
    expect(screen.queryByRole('button', { name: '+ Thêm ngày nghỉ' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Lưu lịch' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Xoá ngày nghỉ/ })).toBeNull();
    expect(screen.getByText('Chỉ Admin được đổi ngày làm việc.')).toBeTruthy();
  });

  it('tính thử hạn hiện hạn dự kiến', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply(200, { dueDate: '2026-11-09' }));
    render(<CalendarSettings officeId="o1" calendar={calendar} canEdit />);
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-11-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tính hạn' }));
    await screen.findByText(/Hạn dự kiến: 09\/11\/2026/);
  });
});
