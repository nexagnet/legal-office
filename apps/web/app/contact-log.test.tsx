// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContactLog } from '../components/ContactLog';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ContactLog', () => {
  it('lists past contacts with Vietnamese labels', () => {
    render(
      <ContactLog
        caseId="c1"
        canLog={false}
        contacts={[
          {
            id: '1',
            kind: 'RESULT',
            outcome: 'NO_ANSWER',
            actorUserId: 'u',
            at: '2026-10-10T02:20:00Z',
          },
        ]}
      />,
    );
    expect(screen.getByText(/Báo kết quả/)).toBeTruthy();
    expect(screen.getByText(/Không liên lạc được/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('posts the chosen kind and outcome', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    render(<ContactLog caseId="c1" canLog contacts={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả liên hệ' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/vibang/cases/c1/contacts');
    expect(JSON.parse(String(init.body))).toEqual({ kind: 'REMINDER', outcome: 'REACHED' });
  });
});

describe('ContactLog optimistic', () => {
  it('hiện lần liên hệ mới ngay khi gửi, trước khi máy chủ trả lời', async () => {
    let release: (r: Response) => void = () => undefined;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>((r) => (release = r)));
    render(<ContactLog caseId="c1" canLog contacts={[]} />);
    expect(screen.getByText('Chưa ghi nhận lần liên hệ nào.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả liên hệ' }));
    await waitFor(() =>
      expect(screen.getByText(/Nhắc khách đến nhận/, { selector: 'span' })).toBeTruthy(),
    );
    expect(screen.queryByText('Chưa ghi nhận lần liên hệ nào.')).toBeNull();
    release(new Response('{}', { status: 200 }));
  });

  it('gỡ dòng tạm khi máy chủ báo lỗi', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'X' }), { status: 400 }),
    );
    render(<ContactLog caseId="c1" canLog contacts={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu kết quả liên hệ' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).not.toBe(''));
    await waitFor(() => expect(screen.getByText('Chưa ghi nhận lần liên hệ nào.')).toBeTruthy());
  });
});
