import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DmsCaseTable } from '../components/DmsCaseTable';
import {
  activeDmsTab,
  canAddDocument,
  canConfirm,
  canDraft,
  domainBySlug,
  scanState,
  statusForTab,
  type DmsCaseRow,
} from '../lib/dms';

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
