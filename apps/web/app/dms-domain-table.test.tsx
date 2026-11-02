import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DmsDomainTable } from '../components/DmsDomainTable';
import type { DmsBookRow, DmsBookSpec } from '../lib/dms';
import type { DmsSearchCase } from '../lib/dms-browse';
import { listLayoutFor, servedRange, sttRange, vanThuLayout } from '../lib/dms-list-layout';

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
    expect(screen.getByText('Cty CP Hòa Phát')).toBeTruthy();
    expect(screen.getByText('Hà Nội')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xem' }).getAttribute('href')).toBe('/dms/vi-bang/c1');
    expect(screen.getByRole('link', { name: 'Tải' }).getAttribute('href')).toBe(
      '/dms/vi-bang/c1?tab=scan',
    );
  });

  it('Nháp: chưa có STT, không dòng sổ, "Tiếp tục soạn" + "Hủy nháp" cho nháp của mình, "Chỉ xem (được cấp)" cho nháp người khác', () => {
    render(
      <DmsDomainTable
        rows={[
          caseRow({
            id: 'a',
            status: 'DRAFT',
            recorded_at: null,
            title: 'N1',
            created_by: 'u1',
            attributes: { nguoi_yeu_cau: 'Cty CP Hòa Phát' },
          }),
          caseRow({ id: 'b', status: 'DRAFT', recorded_at: null, title: 'N2', created_by: 'u2' }),
        ]}
        caption="c"
        basePath="/dms/vi-bang"
        layout={listLayoutFor('vibang')!}
        spec={undefined}
        byCase={new Map()}
        sttLabel="STT"
        tableKey="t"
        draft={{ kind: 'nhap', userId: 'u1' }}
      />,
    );
    expect(screen.getAllByText('Chưa có STT')).toHaveLength(2);
    expect(screen.getByText('Cty CP Hòa Phát')).toBeTruthy();
    expect(screen.getAllByText('Bản nháp')).toHaveLength(2);
    expect(screen.getAllByText('Chưa ghi sổ')).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Tiếp tục soạn' })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Hủy nháp' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Chỉ xem (được cấp)' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Upload scan' })).toBeNull();
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
    const cell = listLayoutFor('tochuc')!.find((c) => c.id === 'ben')!.cell!(get, [get]);
    expect(cell).toEqual({ primary: 'Phải THA: A', secondary: 'Được THA: B' });
  });

  it('Tống đạt: dải STT, ngày tống đạt gộp "15–18/10/2026" và đếm giấy tờ chưa tống đạt', () => {
    expect(sttRange([10, 11, 12, 13])).toBe('10–13');
    expect(sttRange([6])).toBe('6');
    expect(sttRange([])).toBe('—');
    expect(servedRange(['15/10/2026', '16/10/2026', '18/10/2026'])).toBe('15–18/10/2026');
    expect(servedRange(['15/10/2026', ''])).toBe('15/10/2026 (1 chưa tống đạt)');
    expect(servedRange(['30/09/2026', '02/10/2026'])).toBe('30/09/2026, 02/10/2026');
    expect(servedRange(['', ''])).toBe('');
  });

  it('Tống đạt: hồ sơ nhiều dòng sổ có nút mở rộng và dòng sổ con có ✓', () => {
    const tdSpec: DmsBookSpec = {
      ...spec,
      code: 'S-01',
      domain: 'tongdat',
      source: 'document',
      columns: [
        { no: 1, heading: 'STT', key: 'stt' },
        { no: 2, heading: 'LOẠI', key: 'loai_van_ban' },
        { no: 4, heading: 'Tòa án', key: 'co_quan_toa_an', tick: true },
        { no: 7, heading: 'NGÀY', key: 'ngay_tong_dat' },
      ],
    };
    const mk = (stt: number, over: Record<string, string>): DmsBookRow => ({
      ...bookRow,
      stt,
      document_id: `d${stt}`,
      doc_attributes: over,
    });
    render(
      <DmsDomainTable
        rows={[caseRow({ domain: 'tongdat', title: 'TĐ-1' })]}
        caption="c"
        basePath="/dms/tong-dat"
        layout={listLayoutFor('tongdat')!}
        spec={tdSpec}
        byCase={
          new Map([
            [
              'c1',
              [
                mk(10, {
                  co_quan_toa_an: 'x',
                  ngay_tong_dat: '15/10/2026',
                  loai_van_ban: 'Giấy báo',
                }),
                mk(11, { ngay_tong_dat: '16/10/2026', loai_van_ban: 'Giấy triệu tập' }),
              ],
            ],
          ])
        }
        sttLabel="STT"
        tableKey="t"
      />,
    );
    expect(screen.getByText('STT 10–11')).toBeTruthy();
    expect(screen.getByText('15–16/10/2026')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Mở 2 dòng Sổ S-01 của hồ sơ TĐ-1/ })).toBeTruthy();
    expect(screen.getByText(/Các dòng Sổ S-01 của hồ sơ TĐ-1/)).toBeTruthy();
    expect(screen.getAllByText('✓')).toHaveLength(1);
  });

  it('Văn thư: bố cục theo đúng thứ tự cột sổ + Scan + Xem · Tải, tổng 1144px, không có cột mã hồ sơ', () => {
    const vt: DmsBookSpec = {
      ...spec,
      code: 'VT-DEN',
      domain: 'vtden',
      columns: [
        { no: 1, heading: 'Ngày đến', key: 'ngay_den' },
        { no: 2, heading: 'Số đến', key: 'stt' },
        { no: 6, heading: 'Tên loại và trích yếu nội dung', key: 'title' },
      ],
    };
    const l = vanThuLayout(vt);
    expect(l.map((c) => c.id)).toEqual(['ngay_den', 'stt', 'title', 'scan', 'actions']);
    expect(l.reduce((n, c) => n + c.width, 0)).toBe(1144);
    render(
      <DmsDomainTable
        rows={[caseRow({ domain: 'vtden', scan_count: 2 })]}
        caption="c"
        basePath="/dms/van-ban-den"
        layout={l}
        spec={vt}
        byCase={new Map([['c1', [{ ...bookRow, stt: 4, case_title: 'Giấy mời' }]]])}
        sttLabel="Số đến"
        tableKey="t"
      />,
    );
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('Giấy mời')).toBeTruthy();
    expect(screen.getByText('2 scan')).toBeTruthy();
  });
});
