// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DmsDraftActions } from '../components/DmsCaseActions';
import {
  FileGroupCard,
  FileRow,
  InfoCard,
  InfoGrid,
  NoticeBar,
  PdfPane,
} from '../components/ui/case-detail';
import { DataTable } from '../components/ui/data-table';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('thành phần chi tiết hồ sơ (Figma A2)', () => {
  it('dải thông báo có chữ và liên kết hành động', () => {
    render(<NoticeBar action={<a href="/dms/lich-su">Xem lịch sử</a>}>Hồ sơ đã ghi sổ.</NoticeBar>);
    expect(screen.getByRole('note').textContent).toContain('Hồ sơ đã ghi sổ.');
    expect(screen.getByRole('link', { name: 'Xem lịch sử' })).not.toBeNull();
  });

  it('lưới thông tin: giá trị rỗng hiện dấu gạch', () => {
    render(
      <InfoCard title="Thông tin chung" id="x">
        <InfoGrid
          items={[
            ['Số hồ sơ', '034/2026/VB-THV'],
            ['SĐT khách hàng', ''],
          ]}
        />
      </InfoCard>,
    );
    expect(screen.getByText('034/2026/VB-THV')).not.toBeNull();
    expect(screen.getByText('SĐT khách hàng').nextElementSibling?.textContent).toBe('—');
  });

  it('thẻ nhóm tệp, dòng tệp và khung xem trước', () => {
    render(
      <>
        <FileGroupCard title="Vi bằng (N-04)">
          <FileRow
            name="scan-2.pdf"
            meta="1 KB · v1"
            chip="Bản scan"
            chipTone="main"
            actions={<button type="button">Xem</button>}
          />
        </FileGroupCard>
        <PdfPane
          title="Xem trước scan-2.pdf"
          src="/f.pdf"
          caption="Xem trước · scan-2.pdf"
          actions={<button type="button">In</button>}
        />
      </>,
    );
    expect(screen.getByRole('article', { name: 'Vi bằng (N-04)' })).not.toBeNull();
    expect(screen.getByText('Bản scan')).not.toBeNull();
    expect(screen.getByTitle('Xem trước scan-2.pdf').getAttribute('src')).toBe('/f.pdf');
    expect(screen.getByRole('button', { name: 'In' })).not.toBeNull();
  });
});

describe('bảng thành thẻ bản ghi trên điện thoại (Figma M1)', () => {
  it('gán nhãn cột cho từng ô của hàng hồ sơ, bỏ qua dòng con', () => {
    render(
      <DataTable tableKey="t">
        <table data-labels={JSON.stringify(['STT', 'Người yêu cầu'])}>
          <thead>
            <tr>
              <th>STT</th>
              <th>Người yêu cầu</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>30</th>
              <td>Cty B</td>
            </tr>
            <tr className="dms-sub">
              <td>x</td>
              <td>y</td>
            </tr>
          </tbody>
        </table>
      </DataTable>,
    );
    expect(screen.getByText('Cty B').getAttribute('data-label')).toBe('Người yêu cầu');
    expect(screen.getByText('30').getAttribute('data-label')).toBe('STT');
    expect(screen.getByText('x').getAttribute('data-label')).toBeNull();
  });
});

describe('hủy nháp bằng hộp thoại (Figma A2e)', () => {
  it('bắt buộc lý do rồi mới gửi, không dùng hộp thoại gốc của trình duyệt', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    render(<DmsDraftActions caseId="c1" canRecord={false} canCancel />);
    fireEvent.click(screen.getByRole('button', { name: 'Hủy nháp' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Hủy bản nháp?');
    const confirmBtn = screen.getByRole('button', { name: 'Xác nhận hủy' });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Lý do hủy nháp'), { target: { value: 'Nhập nhầm' } });
    fireEvent.click(confirmBtn);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/dms/cases/c1/cancel-draft',
        expect.objectContaining({ body: JSON.stringify({ reason: 'Nhập nhầm' }) }),
      ),
    );
    expect(confirm).not.toHaveBeenCalled();
  });
});
