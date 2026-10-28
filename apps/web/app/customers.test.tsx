import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { CustomerContracts } from '../components/CustomerContracts';
import { CustomerDirectory } from '../components/CustomerDirectory';
import { CustomerProfileForm, NewCustomerForm } from '../components/CustomerForms';
import { IssueCopyForm, RejectCaseForm } from '../components/CaseRejectCopy';
import { NewViBangSheet } from '../components/NewCaseSheets';
import type { Contract, Customer } from '../lib/customers';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockClear();
});

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const mockOk = () =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply(200, { code: 'ALLOWED' }));
const sent = (spy: ReturnType<typeof mockOk>, i = 0) => {
  const [url, init] = spy.mock.calls[i]!;
  return { url, init: init as RequestInit, body: JSON.parse((init as RequestInit).body as string) };
};

const person: Customer = {
  id: 'c1',
  kind: 'PERSON',
  externalRef: 'KH-001',
  displayName: 'Nguyễn Giả Lập',
  idNumber: '000000000001',
  address: 'Số 1 phố Thử',
  phone: '0900000000',
  taxCode: null,
  representative: null,
};
const org: Customer = {
  ...person,
  id: 'c2',
  kind: 'ORGANIZATION',
  externalRef: 'KH-002',
  displayName: 'Công ty Giả Lập',
  idNumber: null,
  taxCode: '0100000000',
  representative: 'Trần Đại Diện',
};
const contract: Contract = {
  id: 'k1',
  customerId: 'c1',
  externalRef: 'HĐ-001',
  serviceKind: 'VI_BANG',
  signedOn: '2026-10-01',
  validFrom: '2026-10-01',
  validTo: null,
  status: 'ACTIVE',
  note: null,
};

describe('CustomerDirectory', () => {
  it('lists customers with their contracts and says when none is attached', () => {
    render(<CustomerDirectory customers={[person, org]} contracts={[contract]} query="" />);
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('Nguyễn Giả Lập')).toBeTruthy();
    expect(screen.getByText('HĐ-001')).toBeTruthy();
    expect(screen.getByText('Chưa gắn hợp đồng')).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Tổ chức' })).toBeTruthy();
    expect(
      screen.getAllByRole('link', { name: 'Xem và sửa' }).map((a) => a.getAttribute('href')),
    ).toEqual(['/hop-dong/khach/c1', '/hop-dong/khach/c2']);
  });

  it('shows an honest permission-or-empty state without fabricating rows', () => {
    render(<CustomerDirectory customers={[]} contracts={[]} query="" />);
    const state = screen.getByRole('status');
    expect(state.textContent).toContain('không được xem dữ liệu cá nhân');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows a search-specific empty state when a query matched nothing', () => {
    render(<CustomerDirectory customers={[]} contracts={[]} query="abc" />);
    expect(screen.getByRole('status').textContent).toContain('Không có khách hàng khớp');
  });

  it('edits a person without sending organisation-only fields', async () => {
    const spy = mockOk();
    render(<CustomerProfileForm customer={person} />);
    expect(screen.queryByLabelText('Mã số thuế')).toBeNull();
    fireEvent.change(screen.getByLabelText('Tên hiển thị'), { target: { value: 'Tên Mới' } });
    fireEvent.change(screen.getByLabelText('Điện thoại'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const r = sent(spy);
    expect(r.url).toBe('/api/vibang/customers/c1/profile');
    expect(r.init.method).toBe('POST');
    expect(r.body).toEqual({
      displayName: 'Tên Mới',
      idNumber: '000000000001',
      address: 'Số 1 phố Thử',
    });
  });

  it('edits an organisation with tax code and representative but no id number', async () => {
    const spy = mockOk();
    render(<CustomerProfileForm customer={org} />);
    expect(screen.queryByLabelText('Số giấy tờ tuỳ thân')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(sent(spy).body).toEqual({
      displayName: 'Công ty Giả Lập',
      address: 'Số 1 phố Thử',
      phone: '0900000000',
      taxCode: '0100000000',
      representative: 'Trần Đại Diện',
    });
  });

  it('maps FIELD_NOT_FOR_KIND from the server to a Vietnamese message', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      reply(400, { code: 'FIELD_NOT_FOR_KIND' }),
    );
    render(<CustomerProfileForm customer={person} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }));
    expect((await screen.findAllByRole('alert'))[0]!.textContent).toContain('không áp dụng');
  });

  it('sends the contract edit body with nulls for cleared dates', async () => {
    const spy = mockOk();
    render(
      <CustomerContracts
        customer={person}
        customers={[person]}
        contracts={[contract]}
        baseHref="/hop-dong/khach/c1"
        selectedId="k1"
      />,
    );
    const form = screen.getByRole('form', { name: 'Hợp đồng HĐ-001' });
    fireEvent.change(within(form).getByLabelText('Dịch vụ'), { target: { value: 'TONG_DAT' } });
    fireEvent.change(within(form).getByLabelText('Trạng thái'), { target: { value: 'ENDED' } });
    fireEvent.change(within(form).getByLabelText('Hiệu lực đến'), {
      target: { value: '2026-12-31' },
    });
    fireEvent.change(within(form).getByLabelText('Ghi chú'), { target: { value: 'ghi chú' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Lưu hợp đồng' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const r = sent(spy);
    expect(r.url).toBe('/api/vibang/contracts/k1');
    expect(r.body).toEqual({
      serviceKind: 'TONG_DAT',
      signedOn: '2026-10-01',
      validFrom: '2026-10-01',
      validTo: '2026-12-31',
      status: 'ENDED',
      note: 'ghi chú',
    });
    expect(Object.keys(r.body)).not.toContain('amount');
  });

  it('shows contract cards and opens the form only for the selected contract', () => {
    render(
      <CustomerContracts
        customer={person}
        customers={[person]}
        contracts={[contract]}
        baseHref="/hop-dong/khach/c1"
        selectedId={null}
      />,
    );
    expect(screen.getByText('HĐ-001')).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'Hợp đồng HĐ-001' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Xem và sửa' }).getAttribute('href')).toBe(
      '/hop-dong/khach/c1?tab=hop-dong&hd=k1',
    );
  });

  it('creates a contract for the selected customer', async () => {
    const spy = mockOk();
    render(
      <CustomerContracts
        customer={person}
        customers={[person]}
        contracts={[]}
        baseHref="/hop-dong/khach/c1"
        selectedId={null}
      />,
    );
    fireEvent.change(screen.getByLabelText('Mã hợp đồng mới'), { target: { value: ' HĐ-9 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm hợp đồng' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const r = sent(spy);
    expect(r.url).toBe('/api/vibang/customers/c1/contracts');
    expect(r.body).toEqual({ externalRef: 'HĐ-9' });
  });
});

describe('NewCustomerForm', () => {
  it('posts kind and external reference', async () => {
    const spy = mockOk();
    render(<NewCustomerForm />);
    fireEvent.change(screen.getByLabelText('Loại'), { target: { value: 'ORGANIZATION' } });
    fireEvent.change(screen.getByLabelText('Mã khách hàng'), { target: { value: 'KH-77' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm khách hàng' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const r = sent(spy);
    expect(r.url).toBe('/api/vibang/customers');
    expect(r.body).toEqual({ kind: 'ORGANIZATION', externalRef: 'KH-77' });
  });
});

describe('NewViBangSheet', () => {
  const branches = [{ id: 'b1', name: 'Trụ sở chính', officeId: 'o1' }] as never;

  it('creates the customer, saves the profile and creates the case in three steps', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED', label: 'new-id' }));
    render(<NewViBangSheet branches={branches} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Tạo hồ sơ Vi bằng' }));
    fireEvent.change(screen.getByLabelText('Mã tham chiếu khách hàng'), {
      target: { value: 'KH-9' },
    });
    fireEvent.change(screen.getByLabelText(/Tên khách hàng/), { target: { value: 'Nguyễn A' } });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/ }));
    fireEvent.change(screen.getByLabelText('Tiêu đề hồ sơ'), { target: { value: 'Giao nhận' } });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp nhận hồ sơ' }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(3));
    expect(sent(spy, 0).url).toBe('/api/vibang/customers');
    expect(sent(spy, 0).body).toEqual({ kind: 'PERSON', externalRef: 'KH-9' });
    expect(sent(spy, 1).url).toBe('/api/vibang/customers/new-id/profile');
    expect(sent(spy, 1).body).toEqual({ displayName: 'Nguyễn A' });
    expect(sent(spy, 2).url).toBe('/api/vibang/cases');
    expect(sent(spy, 2).body).toMatchObject({ customerId: 'new-id', title: 'Giao nhận' });
  });

  it('does not ask for the optional fields before continuing', () => {
    mockOk();
    render(<NewViBangSheet branches={branches} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Tạo hồ sơ Vi bằng' }));
    fireEvent.change(screen.getByLabelText('Mã tham chiếu khách hàng'), {
      target: { value: 'KH-9' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục/ }));
    expect(screen.getByLabelText('Tiêu đề hồ sơ')).toBeTruthy();
  });
});

describe('RejectCaseForm', () => {
  it('offers the eight Điều 28 clauses and posts the chosen clause with the reason', async () => {
    const spy = mockOk();
    render(<RejectCaseForm caseId="case-1" />);
    expect(screen.getAllByRole('radio')).toHaveLength(8);
    fireEvent.click(screen.getByLabelText('Đời tư, trái đạo đức xã hội'));
    fireEvent.change(screen.getByLabelText('Lý do từ chối'), { target: { value: 'đời tư' } });
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối yêu cầu' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const r = sent(spy);
    expect(r.url).toBe('/api/vibang/cases/case-1/rejection');
    expect(r.init.method).toBe('POST');
    expect(r.body).toEqual({ clause: 3, reason: 'đời tư' });
  });

  it('marks the basis required for clause 8 as a hint, sends it, and lets the server decide', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    spy.mockImplementationOnce(() => reply(400, { code: 'BASIS_REQUIRED' }));
    render(<RejectCaseForm caseId="case-1" />);
    const basis = screen.getByLabelText('Căn cứ') as HTMLInputElement;
    expect(basis.required).toBe(false);
    fireEvent.click(screen.getByLabelText('Căn cứ khác có cơ sở'));
    const basis8 = screen.getByLabelText(/Căn cứ \(bắt buộc/) as HTMLInputElement;
    expect(basis8.required).toBe(true);
    fireEvent.change(screen.getByLabelText('Lý do từ chối'), { target: { value: 'lý do' } });
    fireEvent.submit(basis8.form!);
    expect((await screen.findByRole('alert')).textContent).toBe('Cần nhập căn cứ.');
    expect(sent(spy as never).body).toEqual({ clause: 8, reason: 'lý do' });
    spy.mockImplementationOnce(() => reply(200, { code: 'ALLOWED' }));
    fireEvent.change(basis8, { target: { value: 'Điều khác' } });
    fireEvent.submit(basis8.form!);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(sent(spy as never, 1).body).toEqual({ clause: 8, basis: 'Điều khác', reason: 'lý do' });
  });

  it('maps server refusals to Vietnamese messages', async () => {
    const codes: Record<string, string> = {
      ROLE_LACKS_PERMISSION: 'Vai trò của bạn không được thực hiện thao tác này.',
      NOT_RESPONSIBLE_THV: 'Chỉ THV phụ trách',
      REJECT_NOT_ALLOWED: 'không từ chối được',
      INVALID_CLAUSE: 'Khoản của Điều 28',
      REASON_REQUIRED: 'Cần nhập lý do.',
    };
    for (const [code, text] of Object.entries(codes)) {
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => reply(403, { code }));
      const { unmount } = render(<RejectCaseForm caseId="c" />);
      fireEvent.change(screen.getByLabelText('Lý do từ chối'), { target: { value: 'x' } });
      fireEvent.click(screen.getByRole('button', { name: 'Từ chối yêu cầu' }));
      expect((await screen.findByRole('alert')).textContent).toContain(text);
      unmount();
    }
  });
});

describe('IssueCopyForm', () => {
  const fill = () => {
    fireEvent.change(screen.getByLabelText('Người yêu cầu thuộc nhóm'), {
      target: { value: 'AUTHORITY' },
    });
    fireEvent.change(screen.getByLabelText('Người hoặc cơ quan yêu cầu'), {
      target: { value: 'Cơ quan A' },
    });
    fireEvent.change(screen.getByLabelText(/^Căn cứ/), { target: { value: 'Công văn 12' } });
    fireEvent.change(screen.getByLabelText('Số bản sao'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Người nhận bản sao'), { target: { value: 'Ông B' } });
  };

  it('posts kind, requester, basis, numeric copies and receiver', async () => {
    const spy = mockOk();
    render(<IssueCopyForm caseId="case-2" />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Cấp bản sao' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const r = sent(spy);
    expect(r.url).toBe('/api/vibang/cases/case-2/copies');
    expect(r.body).toEqual({
      kind: 'AUTHORITY',
      requester: 'Cơ quan A',
      basis: 'Công văn 12',
      copies: 2,
      receivedBy: 'Ông B',
    });
    expect(await screen.findByText('Đã ghi nhận cấp bản sao.')).toBeTruthy();
  });

  it('renders the Figma layout with the check panel when given a case title', () => {
    mockOk();
    render(<IssueCopyForm caseId="case-2" caseTitle="251/2026/VB-THV" />);
    expect(screen.getByLabelText('Vi bằng gốc')).toHaveProperty('value', '251/2026/VB-THV');
    expect(screen.getByText('Kiểm soát cấp bản sao')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cấp bản sao' })).toBeTruthy();
  });

  it('maps CASE_NOT_RETURNED, INVALID_COPIES and FIELDS_REQUIRED', async () => {
    const codes: Record<string, string> = {
      CASE_NOT_RETURNED: 'đã trả kết quả',
      INVALID_COPIES: 'từ 1 đến 50',
      FIELDS_REQUIRED: 'Cần nhập đủ',
      INVALID_KIND: 'Loại yêu cầu',
    };
    for (const [code, text] of Object.entries(codes)) {
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => reply(400, { code }));
      const { unmount } = render(<IssueCopyForm caseId="c" />);
      fill();
      fireEvent.click(screen.getByRole('button', { name: 'Cấp bản sao' }));
      expect((await screen.findByRole('alert')).textContent).toContain(text);
      unmount();
    }
  });
});
