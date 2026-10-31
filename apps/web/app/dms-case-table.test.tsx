import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DmsAmendmentForm } from '../components/DmsAmendments';
import { DmsBookTable } from '../components/DmsBookTable';
import { DmsCaseTable } from '../components/DmsCaseTable';
import { DmsThvConfirmButton, DmsThvPicker } from '../components/DmsThvActions';
import {
  AMENDMENT_STATUS_LABEL,
  DMS_DOMAIN_LABELS,
  activeDmsTab,
  amendmentSummary,
  canAddDocument,
  canConfirm,
  canDraft,
  domainBySlug,
  headerGroups,
  inputColumns,
  isVanThu,
  scanState,
  statusForTab,
  type DmsCaseRow,
} from '../lib/dms';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => cleanup());

const row = (over: Partial<DmsCaseRow>): DmsCaseRow => ({
  id: 'c1',
  domain: 'vibang',
  title: 'Hồ sơ thử',
  status: 'RECORDED',
  created_by: 'u1',
  created_at: '2026-10-24T03:00:00Z',
  recorded_at: '2026-10-25T03:00:00Z',
  document_count: 2,
  scan_count: 1,
  ...over,
});

describe('lib/dms', () => {
  it('ánh xạ slug web sang mã miền API, slug lạ không có', () => {
    expect(domainBySlug('vi-bang')?.code).toBe('vibang');
    expect(domainBySlug('to-chuc-tha')?.code).toBe('tochuc');
    expect(domainBySlug('khac')).toBeUndefined();
  });
  it('tab lạ rơi về Chính thức; mỗi tab ứng với một trạng thái', () => {
    expect(activeDmsTab(undefined)).toBe('chinh-thuc');
    expect(activeDmsTab('abc')).toBe('chinh-thuc');
    expect(statusForTab(activeDmsTab('nhap'))).toBe('DRAFT');
    expect(statusForTab(activeDmsTab('da-huy'))).toBe('CANCELLED');
    expect(statusForTab('chinh-thuc')).toBe('RECORDED');
  });
  it('tình trạng scan', () => {
    expect(scanState({ document_count: 0, scan_count: 0 })).toBe('no-documents');
    expect(scanState({ document_count: 3, scan_count: 0 })).toBe('missing');
    expect(scanState({ document_count: 3, scan_count: 2 })).toBe('ok');
  });
  it('chỉ hiện nút tạo nháp khi có quyền draft của đúng miền', () => {
    expect(canDraft(['vibang.draft.own'], 'vibang')).toBe(true);
    expect(canDraft(['vibang.draft.all'], 'vibang')).toBe(true);
    expect(canDraft(['vibang.draft.own'], 'tongdat')).toBe(false);
    expect(canDraft(['vibang.read.own'], 'vibang')).toBe(false);
  });
});

describe('DmsCaseTable', () => {
  it('hiện số tài liệu và số scan tách bạch, một hàng một hồ sơ', () => {
    render(<DmsCaseTable caption="Vi bằng" rows={[row({})]} />);
    expect(screen.getByText('Hồ sơ thử')).toBeTruthy();
    expect(screen.getByText('2 tài liệu')).toBeTruthy();
    expect(screen.getByText('1 scan')).toBeTruthy();
  });
  it('cảnh báo thiếu scan và hồ sơ chưa có tài liệu', () => {
    render(
      <DmsCaseTable
        caption="Vi bằng"
        rows={[
          row({ id: 'a', title: 'A', scan_count: 0 }),
          row({ id: 'b', title: 'B', document_count: 0, scan_count: 0 }),
        ]}
      />,
    );
    expect(screen.getByText('Thiếu scan')).toBeTruthy();
    expect(screen.getByText('Chưa có tài liệu')).toBeTruthy();
  });
  it('nháp chưa ghi sổ hiện "—" ở cột ghi sổ; danh sách rỗng có thông báo', () => {
    const { unmount } = render(
      <DmsCaseTable caption="x" rows={[row({ status: 'DRAFT', recorded_at: null })]} />,
    );
    expect(screen.getByText('—')).toBeTruthy();
    unmount();
    render(<DmsCaseTable caption="x" rows={[]} />);
    expect(screen.getByRole('status').textContent).toContain('Chưa có hồ sơ');
  });
});

describe('quyền ở trang chi tiết và liên kết hồ sơ', () => {
  it('canConfirm/canAddDocument nhận own hoặc all, đúng miền', () => {
    expect(canConfirm(['vibang.confirm.own'], 'vibang')).toBe(true);
    expect(canConfirm(['vibang.confirm.all'], 'vibang')).toBe(true);
    expect(canConfirm(['tongdat.confirm.all'], 'vibang')).toBe(false);
    expect(canAddDocument(['vibang.add_document.own'], 'vibang')).toBe(true);
    expect(canAddDocument(['vibang.draft.own'], 'vibang')).toBe(false);
  });

  it('có basePath thì tên hồ sơ là liên kết tới trang chi tiết', () => {
    render(<DmsCaseTable rows={[row({ id: 'abc' })]} caption="c" basePath="/dms/vi-bang" />);
    expect(screen.getByRole('link', { name: 'Hồ sơ thử' }).getAttribute('href')).toBe(
      '/dms/vi-bang/abc',
    );
  });
});

describe('sổ nghiệp vụ trên giao diện', () => {
  const spec = {
    code: 'S-05',
    domain: 'tochuc',
    form: 'TP-THV-S-05',
    title: 'SỔ THEO DÕI VIỆC THI HÀNH ÁN',
    source: 'case' as const,
    columns: [
      { no: 1, heading: 'STT', key: 'stt' },
      { no: 2, heading: 'HỢP ĐỒNG', key: 'hop_dong_dich_vu' },
      { no: 3, heading: 'Số, ngày', key: 'qd', group: 'QUYẾT ĐỊNH' },
      { no: 4, heading: 'Thu hồi', key: 'thu_hoi', group: 'QUYẾT ĐỊNH' },
    ],
  };
  const r = {
    stt: 2,
    case_id: 'c',
    document_id: null,
    case_title: 't',
    case_attributes: { hop_dong_dich_vu: 'HĐ 11', qd: '21/QĐ' },
    doc_kind: null,
    doc_attributes: null,
  };

  it('gộp tiêu đề nhóm cột và chỉ lấy cột nhập tay', () => {
    expect(headerGroups(spec.columns).map((g) => [g.label, g.span])).toEqual([
      [null, 1],
      [null, 1],
      ['QUYẾT ĐỊNH', 2],
    ]);
    expect(inputColumns(spec).map((c) => c.key)).toEqual(['hop_dong_dich_vu', 'qd', 'thu_hoi']);
  });

  it('dòng sổ: STT của hệ thống, ô thiếu để trống, có hàng đánh số cột', () => {
    render(<DmsBookTable spec={spec} rows={[r]} />);
    expect(screen.getByText('HĐ 11')).toBeTruthy();
    expect(screen.getByText('21/QĐ')).toBeTruthy();
    expect(screen.getAllByText('2')).toHaveLength(2); // số cột 2 và STT 2
    expect(screen.getByText('3 · 4')).toBeTruthy();
  });

  it('chưa có dòng thì báo trống thay vì bảng rỗng', () => {
    render(<DmsBookTable spec={spec} rows={[]} />);
    expect(screen.getByText('Chưa có dòng nào trong năm này.')).toBeTruthy();
  });
});

describe('thừa hành viên tự xác nhận', () => {
  it('đã xác nhận thì không còn nút xác nhận', () => {
    render(<DmsThvConfirmButton caseId="c" confirmed />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('đã xác nhận');
  });

  it('chưa xác nhận thì có nút; chọn THV hiện đủ lựa chọn và trạng thái chờ', () => {
    render(<DmsThvConfirmButton caseId="c" confirmed={false} />);
    expect(screen.getByRole('button', { name: 'Tôi xác nhận nội dung này' })).toBeTruthy();
    render(
      <DmsThvPicker
        caseId="c"
        options={[{ userId: 'u1', label: 'Nguyễn Minh' }]}
        currentId="u1"
        confirmed={false}
      />,
    );
    expect(screen.getByRole('option', { name: 'Nguyễn Minh' })).toBeTruthy();
    expect(screen.getByText('Chờ THV xác nhận')).toBeTruthy();
  });
});

describe('Văn thư', () => {
  it('ba sổ văn thư có đường dẫn riêng và nhận diện đúng', () => {
    expect(domainBySlug('van-ban-den')).toMatchObject({ code: 'vtden', book: 'VT-DEN' });
    expect(domainBySlug('van-ban-noi-bo')?.code).toBe('vtnb');
    expect(isVanThu('vtdi')).toBe(true);
    expect(isVanThu('vibang')).toBe(false);
  });
  it('cột nhập tay bỏ Số đến/STT và trích yếu (đã nhập ở tên hồ sơ)', () => {
    const cols = inputColumns({
      columns: [
        { no: 1, heading: 'Số đến', key: 'stt' },
        { no: 2, heading: 'Trích yếu', key: 'title' },
        { no: 3, heading: 'Ghi chú', key: 'ghi_chu' },
      ],
    });
    expect(cols.map((c) => c.key)).toEqual(['ghi_chu']);
  });
});

describe('sửa đổi sau khi lưu', () => {
  it('tóm tắt nội dung sửa và nhãn trạng thái', () => {
    expect(
      amendmentSummary({
        kind: 'CASE_FIELDS',
        proposed: { title: 'Mới', attributes: { ghi_chu: 'x' } },
      }),
    ).toBe('Tiêu đề → Mới; ghi_chu → x');
    expect(AMENDMENT_STATUS_LABEL.PENDING).toBe('Chờ Admin duyệt');
  });
  it('form yêu cầu bắt buộc bản scan và lý do; N-11 chỉ khi được phép', () => {
    render(
      <DmsAmendmentForm
        caseId="c1"
        columns={[{ no: 3, heading: 'Ghi chú', key: 'ghi_chu' }]}
        current={{ ghi_chu: 'gốc' }}
        currentTitle="Hồ sơ"
        allowN11
      />,
    );
    expect((screen.getByLabelText(/Bản scan văn bản sửa đổi/) as HTMLInputElement).required).toBe(
      true,
    );
    expect((screen.getByLabelText(/Lý do sửa đổi/) as HTMLTextAreaElement).required).toBe(true);
    expect(screen.queryByLabelText(/N-11/)).not.toBeNull();
  });
});

describe('báo cáo tổng hợp', () => {
  it('đủ nhãn cho bảy miền', () => {
    expect(Object.keys(DMS_DOMAIN_LABELS)).toHaveLength(7);
    expect(DMS_DOMAIN_LABELS.vtden).toContain('Văn bản đến');
  });
});
