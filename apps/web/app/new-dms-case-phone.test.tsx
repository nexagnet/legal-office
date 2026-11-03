// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewDmsCaseForm } from '../components/NewDmsCaseForm';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockClear();
});

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const mockApi = (
  createStatus = 200,
  createBody: unknown = { code: 'CASE_DRAFT_CREATED', label: 'c1' },
) =>
  vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation((url) =>
      String(url).includes('/me/branches')
        ? reply(200, { rows: [] })
        : reply(createStatus, createBody),
    );
const createBodyOf = (spy: { mock: { calls: unknown[][] } }) =>
  JSON.parse(
    (spy.mock.calls.find((c) => String(c[0]) === '/api/dms/cases')![1] as RequestInit)
      .body as string,
  ) as { attributes: Record<string, unknown> };

describe('NewDmsCaseForm: SĐT khách hàng (N1)', () => {
  it('gửi so_dien_thoai khi có nhập', async () => {
    const spy = mockApi();
    render(<NewDmsCaseForm officeId="o1" domainCode="vibang" />);
    fireEvent.change(screen.getByLabelText('Tên hồ sơ'), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText('SĐT khách hàng'), {
      target: { value: ' 0912 345 678 ' },
    });
    fireEvent.submit(screen.getByLabelText('Tên hồ sơ').closest('form')!);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(createBodyOf(spy).attributes).toMatchObject({ so_dien_thoai: '0912 345 678' });
  });

  it('bỏ trống thì không gửi khóa so_dien_thoai', async () => {
    const spy = mockApi();
    render(<NewDmsCaseForm officeId="o1" domainCode="tongdat" />);
    fireEvent.change(screen.getByLabelText('Tên hồ sơ'), { target: { value: 'A' } });
    fireEvent.submit(screen.getByLabelText('Tên hồ sơ').closest('form')!);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(createBodyOf(spy).attributes).not.toHaveProperty('so_dien_thoai');
  });

  it('Văn thư không có ô SĐT', () => {
    mockApi();
    render(<NewDmsCaseForm officeId="o1" domainCode="vtden" />);
    expect(screen.queryByLabelText('SĐT khách hàng')).toBeNull();
  });

  it('máy chủ từ chối số sai (400) thì báo bằng tiếng Việt, không chuyển trang', async () => {
    mockApi(400, { message: ['attributes.so_dien_thoai: số điện thoại không hợp lệ'] });
    render(<NewDmsCaseForm officeId="o1" domainCode="vibang" />);
    fireEvent.change(screen.getByLabelText('Tên hồ sơ'), { target: { value: 'A' } });
    fireEvent.submit(screen.getByLabelText('Tên hồ sơ').closest('form')!);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('số điện thoại');
    expect(refresh).not.toHaveBeenCalled();
  });
});
