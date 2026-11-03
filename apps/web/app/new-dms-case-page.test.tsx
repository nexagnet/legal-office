// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewDmsCasePage } from '../components/NewDmsCasePage';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  push.mockClear();
});

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const mockApi = (
  branches: readonly { id: string; name: string }[] = [],
  createStatus = 200,
  createBody: unknown = { code: 'CASE_DRAFT_CREATED', label: 'c1' },
) =>
  vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation((url) =>
      String(url).includes('/me/branches')
        ? reply(200, { rows: branches })
        : reply(createStatus, createBody),
    );
const createBodyOf = (spy: { mock: { calls: unknown[][] } }) =>
  JSON.parse(
    (spy.mock.calls.find((c) => String(c[0]) === '/api/dms/cases')![1] as RequestInit)
      .body as string,
  ) as { title: string; attributes: Record<string, unknown>; branchId?: string };

const COLUMNS = [
  { no: 2, heading: 'Người yêu cầu', key: 'nguoi_yeu_cau' },
  { no: 3, heading: 'Nội dung', key: 'noi_dung' },
] as const;

const view = () =>
  render(
    <NewDmsCasePage
      officeId="o1"
      domainCode="vibang"
      domainLabel="Vi bằng"
      bookCode="S-02"
      columns={COLUMNS}
      creatorName="Lê Hà"
      createdOn="03/11/2026"
      cancelHref="/dms/vi-bang"
      redirectBase="/dms/vi-bang"
    />,
  );

describe('NewDmsCasePage (Figma "Tạo hồ sơ")', () => {
  it('có ba khối A, B, C, thông tin hệ thống chỉ đọc và nút Hủy về danh sách', () => {
    mockApi();
    view();
    expect(
      screen.getByRole('heading', { name: /A\. Thông tin Vi bằng — phục vụ Sổ S-02/ }),
    ).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'B. Tài liệu đính kèm' })).not.toBeNull();
    expect(screen.getByRole('heading', { name: /C\. Thông tin hệ thống/ })).not.toBeNull();
    expect(screen.getByText('Tự cấp khi xác nhận')).not.toBeNull();
    expect(screen.getByText('Lê Hà')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Hủy' }).getAttribute('href')).toBe('/dms/vi-bang');
    expect(screen.getByLabelText(/Cột 2: Người yêu cầu/)).not.toBeNull();
  });

  it('lưu nháp gửi tên, các cột sổ, SĐT rồi chuyển vào hồ sơ vừa tạo', async () => {
    const spy = mockApi();
    view();
    fireEvent.change(screen.getByLabelText('Tên hồ sơ'), { target: { value: ' Vi bằng A ' } });
    fireEvent.change(screen.getByLabelText(/Cột 2: Người yêu cầu/), {
      target: { value: 'Cty B' },
    });
    fireEvent.change(screen.getByLabelText(/SĐT khách hàng/), {
      target: { value: '0912 345 678' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dms/vi-bang/c1'));
    const body = createBodyOf(spy);
    expect(body.title).toBe('Vi bằng A');
    expect(body.attributes).toEqual({ nguoi_yeu_cau: 'Cty B', so_dien_thoai: '0912 345 678' });
  });

  it('nhiều chi nhánh thì bắt chọn và gửi branchId', async () => {
    const spy = mockApi([
      { id: 'b1', name: 'Hai Bà Trưng' },
      { id: 'b2', name: 'Cầu Giấy' },
    ]);
    view();
    const select = await screen.findByLabelText('Chi nhánh');
    fireEvent.change(screen.getByLabelText('Tên hồ sơ'), { target: { value: 'A' } });
    fireEvent.change(select, { target: { value: 'b2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(createBodyOf(spy).branchId).toBe('b2');
  });

  it('lỗi từ máy chủ hiện bằng tiếng Việt và không chuyển trang', async () => {
    mockApi([], 400, {});
    view();
    fireEvent.change(screen.getByLabelText('Tên hồ sơ'), { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('số điện thoại');
    expect(push).not.toHaveBeenCalled();
  });
});
