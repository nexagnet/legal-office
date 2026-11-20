// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DmsColumnFilter } from '../components/DmsColumnFilter';
import { DmsListBusy, useReportListBusy } from '../components/DmsListBusy';
import {
  colChipText,
  colLabel,
  colsToParam,
  COLUMN_FILTERS,
  parseCols,
  withCol,
} from '../lib/dms-col-filters';
import { savedParamsToHref, viewToSavedParams } from '../lib/dms-browse';
import { parseExtraView, viewToQuery } from '../lib/dms-filter-params';

const push = vi.fn();
let search = 'loc=chinh-thuc&p=3';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => '/dms/vi-bang',
  useSearchParams: () => new URLSearchParams(search),
}));
afterEach(() => {
  cleanup();
  push.mockClear();
  search = 'loc=chinh-thuc&p=3';
});

describe('lọc theo cột: tham số', () => {
  it('đọc/ghi qua URL, bỏ khóa sai và dữ liệu sai dạng', () => {
    const cols = { nguoi_yeu_cau: { c: 'Ánh' }, so_ngay_vi_bang: { d: { from: '2026-03-01' } } };
    expect(parseCols(colsToParam(cols))).toEqual(cols);
    expect(parseCols('khong phai json')).toEqual({});
    expect(
      parseCols(JSON.stringify({ 'a b': { c: 'x' }, ok: { c: ' ' }, ghi_chu: { b: true } })),
    ).toEqual({
      ghi_chu: { b: true },
    });
    expect(parseCols(JSON.stringify({ x: { d: { from: '03/2026' } } }))).toEqual({});
    expect(colsToParam({})).toBeUndefined();
  });

  it('withCol thêm, thay và bỏ một cột', () => {
    const a = withCol({}, 'ghi_chu', { c: 'abc' });
    expect(a).toEqual({ ghi_chu: { c: 'abc' } });
    expect(withCol(a, 'ghi_chu', { c: '' })).toEqual({});
    expect(withCol(a, 'ghi_chu', undefined)).toEqual({});
  });

  it('chip có nhãn cột và giá trị', () => {
    expect(colChipText('Người yêu cầu', { c: 'Ánh' })).toBe('Người yêu cầu: chứa "Ánh"');
    expect(colChipText('Ngày', { d: { from: '2026-03-05', to: '2026-04-01' } })).toBe(
      'Ngày: 05/03/2026 – 01/04/2026',
    );
    expect(colChipText('Tòa án', { b: true })).toBe('Tòa án: có');
    expect(colLabel('vibang', 'nguoi_yeu_cau')).toBe('Người yêu cầu');
  });

  it('không có cột lọc nào là "Loại tài liệu"', () => {
    for (const d of Object.values(COLUMN_FILTERS))
      for (const fields of Object.values(d))
        for (const f of fields) expect(f.label).not.toMatch(/Loại tài liệu/);
  });

  it('nằm trên URL, lưu được và mở lại đúng, xuất Excel dùng cùng bộ lọc', () => {
    const view = { filter: 'chinh-thuc' as const, cols: { ghi_chu: { c: 'x' } } };
    const qs = viewToQuery(view);
    expect(parseExtraView({ cl: qs.get('cl')! }).cols).toEqual(view.cols);
    const saved = viewToSavedParams(view);
    expect(saved.cols).toBe(JSON.stringify(view.cols));
    const href = savedParamsToHref('/dms/vi-bang', saved);
    expect(parseCols(new URLSearchParams(href.split('?')[1]).get('cl')!)).toEqual(view.cols);
    expect(viewToQuery(view, { drop: ['cl'] }).get('cl')).toBeNull();
  });

  it('bộ lọc đã lưu cũ (máy chủ từng lưu `cols` dạng đối tượng) vẫn mở lại đúng lọc cột', () => {
    const cols = { ghi_chu: { c: 'x' }, ngay: { d: { from: '2026-01-01' } } };
    const href = savedParamsToHref('/dms/vi-bang', { status: 'RECORDED', cols } as never);
    expect(parseCols(new URLSearchParams(href.split('?')[1]).get('cl')!)).toEqual(cols);
  });
});

describe('phễu lọc trên tiêu đề cột', () => {
  it('cột không lọc được chỉ hiện tiêu đề', () => {
    render(<DmsColumnFilter domain="vibang" officeId="o" columnId="scan" head="Tài liệu" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Tài liệu')).toBeTruthy();
  });

  it('nhập chữ rồi Áp dụng: ghi `cl` lên URL và về trang 1', () => {
    render(<DmsColumnFilter domain="vibang" officeId="o" columnId="nguoi_yeu_cau" head="Người" />);
    fireEvent.click(screen.getByRole('button', { name: /Lọc cột Người yêu cầu/ }));
    fireEvent.change(screen.getByLabelText('Người yêu cầu chứa'), { target: { value: 'Ánh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    expect(push).toHaveBeenCalledTimes(1);
    const url = new URL(push.mock.calls[0]![0] as string, 'http://x');
    expect(url.pathname).toBe('/dms/vi-bang');
    expect(url.searchParams.get('p')).toBeNull();
    expect(url.searchParams.get('loc')).toBe('chinh-thuc');
    expect(parseCols(url.searchParams.get('cl')!)).toEqual({ nguoi_yeu_cau: { c: 'Ánh' } });
  });

  it('đang lọc thì phễu đặc và "Xóa lọc cột" bỏ bộ lọc của cột đó', () => {
    search = `cl=${encodeURIComponent(JSON.stringify({ nguoi_yeu_cau: { c: 'a' }, ghi_chu: { c: 'b' } }))}&p=2`;
    render(<DmsColumnFilter domain="vibang" officeId="o" columnId="nguoi_yeu_cau" head="Người" />);
    const trigger = screen.getByRole('button', { name: /Lọc cột Người yêu cầu/ });
    expect(trigger.getAttribute('data-active')).toBe('true');
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Xóa lọc cột' }));
    const url = new URL(push.mock.calls[0]![0] as string, 'http://x');
    expect(parseCols(url.searchParams.get('cl')!)).toEqual({ ghi_chu: { c: 'b' } });
  });

  it('gõ được dấu cách: ô nhập giữ nguyên chữ đang gõ, chỉ cắt khoảng trắng đầu/cuối khi Áp dụng', () => {
    render(<DmsColumnFilter domain="vibang" officeId="o" columnId="nguoi_yeu_cau" head="Người" />);
    fireEvent.click(screen.getByRole('button', { name: /Lọc cột Người yêu cầu/ }));
    const input = screen.getByLabelText('Người yêu cầu chứa') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Nguyễn ' } });
    expect(input.value).toBe('Nguyễn ');
    fireEvent.change(input, { target: { value: 'Nguyễn Văn ' } });
    expect(input.value).toBe('Nguyễn Văn ');
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    const url = new URL(push.mock.calls[0]![0] as string, 'http://x');
    expect(parseCols(url.searchParams.get('cl')!)).toEqual({ nguoi_yeu_cau: { c: 'Nguyễn Văn' } });
  });

  it('chỉ gõ dấu cách rồi Áp dụng: không ghi bộ lọc rỗng', () => {
    render(<DmsColumnFilter domain="vibang" officeId="o" columnId="nguoi_yeu_cau" head="Người" />);
    fireEvent.click(screen.getByRole('button', { name: /Lọc cột Người yêu cầu/ }));
    fireEvent.change(screen.getByLabelText('Người yêu cầu chứa'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    const url = new URL(push.mock.calls[0]![0] as string, 'http://x');
    expect(url.searchParams.get('cl')).toBeNull();
  });
});

describe('lọc theo cột: báo đang tải', () => {
  function Reporter({ pending }: { readonly pending: boolean }) {
    useReportListBusy(pending);
    return null;
  }
  it('làm mờ bảng và hiện "Đang lọc" khi có lệnh lọc chờ máy chủ, hết thì bỏ', () => {
    const { rerender } = render(
      <>
        <Reporter pending={false} />
        <DmsListBusy>
          <table />
        </DmsListBusy>
      </>,
    );
    expect(screen.queryByRole('status')).toBeNull();
    act(() => {
      rerender(
        <>
          <Reporter pending />
          <DmsListBusy>
            <table />
          </DmsListBusy>
        </>,
      );
    });
    expect(screen.getByRole('status', { name: 'Đang lọc danh sách' })).toBeTruthy();
    act(() => {
      rerender(
        <>
          <Reporter pending={false} />
          <DmsListBusy>
            <table />
          </DmsListBusy>
        </>,
      );
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});
