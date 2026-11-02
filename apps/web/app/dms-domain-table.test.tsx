import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DmsDomainTable } from '../components/DmsDomainTable';
import type { DmsBookRow, DmsBookSpec } from '../lib/dms';
import type { DmsSearchCase } from '../lib/dms-browse';
import { listLayoutFor } from '../lib/dms-list-layout';

afterEach(() => cleanup());

const spec: DmsBookSpec = {
  code: 'S-02',
  domain: 'vibang',
  form: 'TP-THV-S-02',
  title: 'SỔ',
  source: 'case',
  columns: [
    { no: 1, heading: 'STT', key: 'stt' },
    { no: 2, heading: 'NGƯỜI YÊU CẦU', key: 'nguoi_yeu_cau' },
    { no: 3, heading: 'GHI CHÚ', key: 'ghi_chu' },
  ],
};
const bookRow: DmsBookRow = {
  stt: 6,
  case_id: 'c1',
  document_id: null,
  case_title: 'VB-1',
  case_attributes: { nguoi_yeu_cau: 'Cty CP Hòa Phát, Hà Nội' },
  doc_kind: null,
  doc_attributes: null,
};
const caseRow = (over: Partial<DmsSearchCase>): DmsSearchCase => ({
  id: 'c1',
  domain: 'vibang',
  title: 'VB-2610-0042',
  status: 'RECORDED',
  created_by: 'u1',
  created_at: '2026-10-24T03:00:00Z',
  recorded_at: '2026-10-25T03:00:00Z',
  document_count: 4,
  scan_count: 9,
  creator_name: null,
  branch_id: null,
  branch_name: null,
  doc_kinds: [],
  pending_count: 0,
  attributes: {},
  ...over,
});

describe('DmsDomainTable (Figma danh sách 4 nghiệp vụ)', () => {
  it('Vi bằng: đủ 9 cột Figma, STT + mã hồ sơ, huy hiệu tài liệu/file/đủ scan, nút Xem · Tải', () => {
    const layout = listLayoutFor('vibang')!;
    expect(layout).toHaveLength(9);
    expect(layout.reduce((n, c) => n + c.width, 0)).toBe(1144);
    render(
      <DmsDomainTable
        rows={[caseRow({ pending_count: 1 })]}
        caption="c"
        basePath="/dms/vi-bang"
        layout={layout}
        spec={spec}
        byCase={new Map([['c1', [bookRow]]])}
        sttLabel="STT"
        tableKey="t"
      />,
    );
    expect(screen.getAllByRole('columnheader')).toHaveLength(9);
    expect(screen.getByText('STT 6')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'VB-2610-0042' })).toBeTruthy();
    expect(screen.getByText('Chờ duyệt sửa đổi')).toBeTruthy();
    expect(screen.getByText('4 tài liệu')).toBeTruthy();
    expect(screen.getByText('9 file')).toBeTruthy();
    expect(screen.getByText('đủ scan')).toBeTruthy();
    expect(screen.getByText('Cty CP Hòa Phát, Hà Nội')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xem' }).getAttribute('href')).toBe('/dms/vi-bang/c1');
    expect(screen.getByRole('link', { name: 'Tải' }).getAttribute('href')).toBe(
      '/dms/vi-bang/c1?tab=scan',
    );
  });

  it('thiếu scan: huy hiệu đỏ, số file nhỏ bên dưới và nút Upload scan thay cho Xem', () => {
    render(
      <DmsDomainTable
        rows={[caseRow({ scan_count: 0 })]}
        caption="c"
        basePath="/dms/vi-bang"
        layout={listLayoutFor('vibang')!}
        spec={spec}
        byCase={new Map()}
        sttLabel="STT"
        tableKey="t"
      />,
    );
    const row = screen.getAllByRole('row')[1]!;
    expect(within(row).getByText('Thiếu scan')).toBeTruthy();
    expect(within(row).getByText('0 file')).toBeTruthy();
    expect(within(row).getByRole('link', { name: 'Upload scan' })).toBeTruthy();
    expect(within(row).queryByRole('link', { name: 'Tải' })).toBeNull();
  });

  it('bốn nghiệp vụ đều có bố cục tổng 1144px; Xác minh/Tổ chức gộp hai thông tin vào một ô', () => {
    for (const d of ['vibang', 'tongdat', 'xacminh', 'tochuc'])
      expect(listLayoutFor(d)!.reduce((n, c) => n + c.width, 0)).toBe(1144);
    const get = (k: string) => ({ ben_phai_thi_hanh_an: 'A', ben_duoc_thi_hanh_an: 'B' })[k] ?? '';
    const cell = listLayoutFor('tochuc')!.find((c) => c.id === 'ben')!.cell!(get);
    expect(cell).toEqual({ primary: 'Phải THA: A', secondary: 'Được THA: B' });
  });
});
