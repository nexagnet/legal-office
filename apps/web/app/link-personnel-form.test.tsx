import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LinkPersonnelForm } from '../components/permissions/LinkPersonnelForm';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const options = [{ person_id: 'p1', full_name: 'Trần Thị B' }];

describe('LinkPersonnelForm', () => {
  it('ghép hồ sơ đã chọn với tài khoản', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
    render(<LinkPersonnelForm officeId="o1" userId="u1" linkedPersonId={null} options={options} />);
    fireEvent.change(screen.getByLabelText('Ghép với hồ sơ lao động có sẵn'), {
      target: { value: 'p1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ghép' }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(String(spy.mock.calls[0]![0])).toBe('/api/office/personnel/p1/link');
    expect(JSON.parse(String((spy.mock.calls[0]![1] as RequestInit).body))).toEqual({
      officeId: 'o1',
      userId: 'u1',
    });
  });

  it('đã có liên kết thì chỉ cho gỡ, gửi userId null', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
    render(<LinkPersonnelForm officeId="o1" userId="u1" linkedPersonId="p9" options={options} />);
    expect(screen.queryByRole('button', { name: 'Ghép' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ liên kết hồ sơ lao động' }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(String(spy.mock.calls[0]![0])).toBe('/api/office/personnel/p9/link');
    expect(JSON.parse(String((spy.mock.calls[0]![1] as RequestInit).body)).userId).toBeNull();
  });
});
