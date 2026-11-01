import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThvCardsForm, type ThvCard, type ThvPerson } from '../components/ThvCardsForm';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockClear();
});

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const people: ThvPerson[] = [
  { userId: 'u1', label: 'Lê Thu Hà', groups: ['Thừa hành viên v3'] },
  { userId: 'u2', label: 'Ngô Đức Long' },
  { userId: 'u3', label: 'Trịnh Mỹ Linh' },
  { userId: 'u4', label: 'Phạm Cũ' },
];
const cards: ThvCard[] = [
  {
    userId: 'u1',
    fullName: 'Lê Thu Hà',
    cardNo: 'TTH-0123',
    status: 'ACTIVE',
    decisionNo: 'QĐ 123/QĐ-BTP',
    decisionDate: '2024-05-05',
    effectiveFrom: '2024-05-05',
    effectiveTo: null,
    hasScan: true,
  },
  // thẻ cũ nhập trước khi có quyết định và bản scan
  { userId: 'u2', fullName: 'Ngô Đức Long', cardNo: 'TTH-0456', status: 'ACTIVE', hasScan: false },
  {
    userId: 'u4',
    fullName: 'Phạm Cũ',
    cardNo: 'TTH-9',
    status: 'SUSPENDED',
    decisionNo: 'QĐ 1/QĐ-BTP',
    decisionDate: '2020-01-01',
    effectiveFrom: '2020-01-01',
    effectiveTo: '2023-01-01',
    hasScan: true,
  },
];

const base = { officeId: 'o1', people, cards, canEdit: true } as const;

describe('ThvCardsForm (Figma Q7: không bước xác nhận, Admin làm trực tiếp)', () => {
  it('phân loại trạng thái và lọc: còn hiệu lực, chờ bổ sung, ngừng hiệu lực', () => {
    render(<ThvCardsForm {...base} />);
    expect(screen.getByText('Còn hiệu lực', { selector: 'span' })).toBeTruthy();
    expect(screen.getAllByText('Thiếu quyết định').length).toBeGreaterThan(0);
    expect(screen.getByText('Chưa có thẻ')).toBeTruthy();
    expect(screen.getByText('Ngừng hiệu lực', { selector: 'span' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tất cả 4' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Chờ bổ sung 2' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Chờ bổ sung 2' }));
    expect(screen.queryByText('Lê Thu Hà')).toBeNull();
    expect(screen.getByText('Ngô Đức Long')).toBeTruthy();
    expect(screen.getByText('Trịnh Mỹ Linh')).toBeTruthy();
  });

  it('cấp thẻ mới: gửi thông tin trên query và bản scan là thân yêu cầu; có hiệu lực ngay', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED' }));
    render(<ThvCardsForm {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nhập thẻ của Trịnh Mỹ Linh' }));
    fireEvent.change(screen.getByLabelText('Số thẻ'), { target: { value: 'TTH-0789' } });
    fireEvent.change(screen.getByLabelText('Số quyết định / giấy tờ'), {
      target: { value: 'QĐ 7/QĐ-BTP' },
    });
    fireEvent.change(screen.getByLabelText('Ngày ban hành quyết định'), {
      target: { value: '2026-10-01' },
    });
    fireEvent.change(screen.getByLabelText('Ngày hiệu lực'), { target: { value: '2026-10-05' } });
    const file = new File(['%PDF-1.4'], 'qd.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/Bản scan quyết định/), { target: { files: [file] } });
    fireEvent.submit(screen.getByRole('form', { name: 'Cập nhật thẻ Trịnh Mỹ Linh' }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toContain('/api/office/thv-cards/u3?');
    const query = new URL(String(url), 'http://x').searchParams;
    expect(Object.fromEntries(query)).toMatchObject({
      officeId: 'o1',
      fullName: 'Trịnh Mỹ Linh',
      cardNo: 'TTH-0789',
      decisionNo: 'QĐ 7/QĐ-BTP',
      decisionDate: '2026-10-01',
      effectiveFrom: '2026-10-05',
    });
    expect((init as RequestInit).method).toBe('POST');
    expect(((init as RequestInit).headers as Record<string, string>)['content-type']).toBe(
      'application/pdf',
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect((await screen.findByRole('status')).textContent).toContain('có hiệu lực ngay');
    expect(screen.queryByText(/xác minh/i)).toBeNull();
  });

  it('báo lỗi tiếng Việt khi thiếu bản scan', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply(422, { code: 'SCAN_REQUIRED' }));
    render(<ThvCardsForm {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật thẻ của Lê Thu Hà' }));
    fireEvent.submit(screen.getByRole('form', { name: 'Cập nhật thẻ Lê Thu Hà' }));
    expect((await screen.findAllByRole('alert'))[0]!.textContent).toContain('bản scan quyết định');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('ngừng hiệu lực qua hộp thoại xác nhận trong trang, giữ lịch sử', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'THV_CARD_SUSPENDED' }));
    render(<ThvCardsForm {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật thẻ của Lê Thu Hà' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ngừng hiệu lực (giữ lịch sử)' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ngừng hiệu lực' }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(String(spy.mock.calls[0]![0])).toBe('/api/office/thv-cards/u1/suspend');
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('thẻ đã ngừng hiệu lực không có nút ngừng nữa; lịch sử mở danh sách kèm liên kết bản scan', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      reply(200, {
        rows: [
          {
            id: 7,
            event: 'ISSUED',
            fullName: 'Phạm Cũ',
            cardNo: 'TTH-9',
            decisionNo: 'QĐ 1/QĐ-BTP',
            decisionDate: '2020-01-01',
            effectiveFrom: '2020-01-01',
            effectiveTo: null,
            hasScan: true,
            at: '2020-01-02T03:00:00Z',
          },
        ],
      }),
    );
    render(<ThvCardsForm {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật thẻ của Phạm Cũ' }));
    expect(screen.queryByRole('button', { name: 'Ngừng hiệu lực (giữ lịch sử)' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Lịch sử thẻ của Phạm Cũ' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Cấp thẻ')).toBeTruthy();
    const link = within(dialog).getByRole('link', { name: /Xem bản scan/ }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/api/office/thv-cards/u4/scan?officeId=o1&historyId=7');
  });
});
