// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DmsAdminEdit } from '../components/DmsAdminEdit';

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
const columns = [
  { no: 2, heading: 'Người yêu cầu', key: 'nguoi_yeu_cau' },
  { no: 3, heading: 'Nội dung yêu cầu', key: 'noi_dung_yeu_cau' },
];
const current = {
  nguoi_yeu_cau: 'Cty A',
  noi_dung_yeu_cau: 'Lập vi bằng',
  so_dien_thoai: '0911111111',
};

async function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Sửa hồ sơ (Admin)' }));
  return screen.findByRole('form', { name: 'Sửa hồ sơ (Admin)' });
}
const bodyOf = (spy: { mock: { calls: unknown[][] } }) =>
  JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string) as Record<string, unknown>;

describe('DmsAdminEdit (Admin sửa hồ sơ đã ghi sổ, N5)', () => {
  it('chỉ gửi trường đã đổi, xóa trống thành null, kèm lý do', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'CASE_EDITED', label: null }));
    render(
      <DmsAdminEdit
        target="case"
        id="c1"
        columns={columns}
        current={current}
        currentTitle="HS"
        withPhone
      />,
    );
    const form = await open();
    fireEvent.change(screen.getByLabelText('SĐT khách hàng'), { target: { value: '0922222222' } });
    fireEvent.change(screen.getByLabelText('Nội dung yêu cầu'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Lý do sửa'), { target: { value: 'Khách đổi số' } });
    fireEvent.submit(form);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(String(spy.mock.calls[0]![0])).toBe('/api/dms/cases/c1/admin-edit');
    expect(bodyOf(spy)).toEqual({
      attributes: { so_dien_thoai: '0922222222', noi_dung_yeu_cau: null },
      reason: 'Khách đổi số',
    });
  });

  it('tài liệu gọi đúng đường dẫn tài liệu và chỉ gửi trường đã đổi', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'DOCUMENT_EDITED', label: null }));
    render(
      <DmsAdminEdit
        target="document"
        id="d1"
        columns={columns}
        current={current}
        buttonLabel="Sửa tài liệu (Admin)"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sửa tài liệu (Admin)' }));
    const form = await screen.findByRole('form', { name: 'Sửa tài liệu (Admin)' });
    fireEvent.change(screen.getByLabelText('Người yêu cầu'), { target: { value: 'Cty B' } });
    fireEvent.change(screen.getByLabelText('Lý do sửa'), { target: { value: 'Gõ sai' } });
    fireEvent.submit(form);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(String(spy.mock.calls[0]![0])).toBe('/api/dms/documents/d1/admin-edit');
    expect(bodyOf(spy)).toEqual({ attributes: { nguoi_yeu_cau: 'Cty B' }, reason: 'Gõ sai' });
  });

  it('đổi tên hồ sơ thì gửi title', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'CASE_EDITED', label: null }));
    render(
      <DmsAdminEdit
        target="case"
        id="c1"
        columns={columns}
        current={current}
        currentTitle="HS cũ"
      />,
    );
    const form = await open();
    fireEvent.change(screen.getByLabelText('Tên hồ sơ'), { target: { value: 'HS mới' } });
    fireEvent.change(screen.getByLabelText('Lý do sửa'), { target: { value: 'Đổi tên' } });
    fireEvent.submit(form);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(bodyOf(spy)).toEqual({ title: 'HS mới', attributes: {}, reason: 'Đổi tên' });
  });

  it('không đổi gì hoặc thiếu lý do thì báo, không gọi API', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    render(<DmsAdminEdit target="case" id="c1" columns={columns} current={current} />);
    const form = await open();
    fireEvent.change(screen.getByLabelText('Lý do sửa'), { target: { value: 'Thử' } });
    fireEvent.submit(form);
    expect((await screen.findByRole('alert')).textContent).toContain('Chưa có thay đổi');
    fireEvent.change(screen.getByLabelText('Người yêu cầu'), { target: { value: 'Cty B' } });
    fireEvent.change(screen.getByLabelText('Lý do sửa'), { target: { value: '   ' } });
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('lý do'));
    expect(spy).not.toHaveBeenCalled();
  });

  it('người không phải Admin bị máy chủ từ chối thì báo tiếng Việt và không làm mới trang', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      reply(403, { code: 'ADMIN_ONLY', label: null }),
    );
    render(<DmsAdminEdit target="case" id="c1" columns={columns} current={current} />);
    const form = await open();
    fireEvent.change(screen.getByLabelText('Người yêu cầu'), { target: { value: 'Cty B' } });
    fireEvent.change(screen.getByLabelText('Lý do sửa'), { target: { value: 'Thử' } });
    fireEvent.submit(form);
    expect((await screen.findByRole('alert')).textContent).toContain('Chỉ Admin');
    expect(refresh).not.toHaveBeenCalled();
  });
});
