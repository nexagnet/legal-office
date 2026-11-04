// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DmsAllCases } from '../components/DmsAllCases';
import type { DmsSearchCase } from '../lib/dms-browse';

afterEach(cleanup);

const row = (over: Partial<DmsSearchCase>): DmsSearchCase =>
  ({
    id: 'c1',
    domain: 'vibang',
    title: 'Hồ sơ thử',
    status: 'DRAFT',
    created_by: 'u1',
    created_at: '2026-11-03T03:00:00.000Z',
    recorded_at: null,
    document_count: 0,
    scan_count: 0,
    creator_name: 'Nguyễn Văn A',
    branch_id: null,
    branch_name: null,
    doc_kinds: [],
    pending_count: 0,
    attributes: {},
    case_number: null,
    returned: false,
    phone: null,
    ...over,
  }) as DmsSearchCase;

describe('DmsAllCases', () => {
  it('hiện nghiệp vụ, trạng thái, người tạo và liên kết tới đúng hồ sơ', () => {
    render(
      <DmsAllCases
        rows={[
          row({}),
          row({
            id: 'c2',
            domain: 'vtden',
            status: 'RECORDED',
            title: 'Công văn',
            case_number: '001/2026/VT-DEN',
          }),
        ]}
        total={2}
        page={1}
        basePath="/dms/cua-toi"
        emptyText="trống"
      />,
    );
    const link = screen.getByRole('link', { name: 'Hồ sơ thử' });
    expect(link.getAttribute('href')).toBe('/dms/vi-bang/c1');
    expect(screen.getByRole('link', { name: '001/2026/VT-DEN' }).getAttribute('href')).toBe(
      '/dms/van-ban-den/c2',
    );
    const first = within(link.closest('tr')!);
    expect(first.getByText('Vi bằng')).toBeTruthy();
    expect(first.getByText('Nháp')).toBeTruthy();
    expect(first.getByText('Nguyễn Văn A')).toBeTruthy();
  });

  it('không có hồ sơ: hiện câu giải thích; nhiều trang: có liên kết trang sau', () => {
    const { rerender } = render(
      <DmsAllCases
        rows={[]}
        total={0}
        page={1}
        basePath="/dms/cua-toi"
        emptyText="Bạn chưa tạo hồ sơ nào."
      />,
    );
    expect(screen.getByText('Bạn chưa tạo hồ sơ nào.')).toBeTruthy();
    rerender(
      <DmsAllCases rows={[row({})]} total={45} page={2} basePath="/dms/cua-toi" emptyText="x" />,
    );
    expect(screen.getByRole('link', { name: /Trang sau/ }).getAttribute('href')).toBe(
      '/dms/cua-toi?p=3',
    );
    expect(screen.getByRole('link', { name: /Trang trước/ }).getAttribute('href')).toBe(
      '/dms/cua-toi',
    );
  });
});
