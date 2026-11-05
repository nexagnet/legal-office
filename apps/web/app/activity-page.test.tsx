import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw new Error('notFound');
  },
}));
vi.mock('../lib/server', () => ({
  API_URL: 'http://api',
  requestCookie: async () => 'sid=1',
  currentSession: async () => ({
    status: 'authenticated',
    roles: ['ADMIN'],
    tenantName: 'T',
    memberships: [{ officeId: 'o1' }],
    branches: [],
  }),
}));

import ActivityPage from './dms/lich-su/page';
import { actionLabel, activityNote } from '../lib/dms-activity';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const row = (over: Record<string, unknown>) => ({
  id: 1,
  at: '2026-11-03T03:00:00Z',
  actor_id: 'u1',
  actor_label: 'Nguyễn Admin (admin@x.vn)',
  action: 'dms.case.record',
  target_type: 'case',
  target_id: 'c1',
  detail: {},
  case_id: 'c1',
  case_number: '030/2026/VB-THV',
  case_title: 'Hồ sơ A',
  domain: 'vibang',
  submission_id: null,
  submission_title: null,
  ...over,
});

function stubApi(permissions: string[], rows: unknown[]) {
  const urls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    urls.push(url);
    const json = (b: unknown) => ({ ok: true, json: async () => b }) as Response;
    if (url.includes('/dms/me/permissions')) return json({ permissions });
    if (url.includes('/dms/activity')) return json({ rows, total: rows.length });
    return json({ rows: [] });
  });
  return urls;
}

const page = async (sp: { group?: string; q?: string; p?: string } = {}) =>
  render(await ActivityPage({ searchParams: Promise.resolve(sp) }));

describe('Lịch sử hoạt động', () => {
  it('Admin thấy giờ, người làm, hoạt động bằng tiếng Việt và liên kết tới hồ sơ/bản trình', async () => {
    stubApi(
      ['dms.permission.approve'],
      [
        row({}),
        row({
          id: 2,
          action: 'dms.submission.decide',
          target_type: 'submission',
          detail: { status: 'APPROVED' },
          case_id: null,
          case_number: null,
          domain: null,
          submission_id: 's1',
          submission_title: 'Bổ sung ủy quyền',
        }),
        row({
          id: 3,
          action: 'dms.scan.purge',
          actor_label: null,
          target_type: 'file',
          detail: {},
        }),
      ],
    );
    await page();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Lịch sử hoạt động');
    expect(screen.getByText('Xác nhận lưu chính thức (cấp số hồ sơ)')).toBeTruthy();
    expect(screen.getByText('Duyệt / từ chối bản trình')).toBeTruthy();
    expect(screen.getAllByText('Nguyễn Admin (admin@x.vn)').length).toBeGreaterThan(0);
    // Dọn scan tự động do hệ thống làm.
    expect(screen.getByText('Hệ thống')).toBeTruthy();
    expect(
      screen.getAllByRole('link', { name: 'Hồ sơ · 030/2026/VB-THV' })[0]!.getAttribute('href'),
    ).toBe('/dms/vi-bang/c1');
    expect(
      screen.getByRole('link', { name: 'Bản trình · Bổ sung ủy quyền' }).getAttribute('href'),
    ).toBe('/dms/trinh-duyet/s1');
    expect(screen.getByText('Đã duyệt')).toBeTruthy();
    // Chỉ đọc: không có nút sửa hay xóa nhật ký.
    expect(screen.queryByRole('button', { name: /xóa|sửa/i })).toBeNull();
  });

  it('chuyển nhóm và từ khóa xuống API', async () => {
    const urls = stubApi(['dms.permission.approve'], []);
    await page({ group: 'file', q: 'VB-THV' });
    const call = urls.find((u) => u.includes('/dms/activity'))!;
    expect(call).toContain('group=file');
    expect(call).toContain('q=VB-THV');
    expect(screen.getByText('Chưa có hoạt động')).toBeTruthy();
  });

  it('nhóm lạ bị bỏ qua, không gửi xuống API', async () => {
    const urls = stubApi(['dms.permission.approve'], []);
    await page({ group: 'khac' });
    expect(urls.find((u) => u.includes('/dms/activity'))).not.toContain('group=');
  });

  it('người không phải Admin chỉ thấy thông báo, không gọi nhật ký', async () => {
    const urls = stubApi([], [row({})]);
    await page();
    expect(screen.getByText('Bạn chưa có quyền xem mục này')).toBeTruthy();
    expect(urls.some((u) => u.includes('/dms/activity'))).toBe(false);
  });
});

describe('nhãn hoạt động', () => {
  it('mã lạ giữ nguyên để dễ báo lỗi; ghi chú chỉ lấy trường đã biết', () => {
    expect(actionLabel('dms.case.admin_edit')).toBe('Admin sửa hồ sơ đã ghi sổ');
    expect(actionLabel('dms.khong.biet')).toBe('dms.khong.biet');
    expect(
      activityNote({ action: 'dms.scan.delete', detail: { label: 'a.pdf', secret: 'x' } }),
    ).toBe('a.pdf');
    expect(activityNote({ action: 'dms.case.set_returned', detail: { returned: true } })).toBe(
      'Đã trả kết quả',
    );
    expect(activityNote({ action: 'dms.file.download', detail: { x: 1 } })).toBe('');
  });
});
