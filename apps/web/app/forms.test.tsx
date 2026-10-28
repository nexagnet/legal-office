import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from '../components/LoginForm';
import { AssignThv } from '../components/AssignThv';
import { AssignHandler } from '../components/AssignHandler';
import { CorrespondenceActions } from '../components/CorrespondenceActions';
import { AdjustBatchForm, NewItemForm, StockMovementForm } from '../components/StockForms';
import { AccessRequestActions } from '../components/AccessRequestActions';
import { AccessRequestForm } from '../components/AccessRequestForm';
import { ReportExport } from '../components/ReportExport';
import { PlaceForm } from '../components/PlaceForm';
import { CustomerDirectory } from '../components/CustomerDirectory';
import { HISTORY_KIND_LABEL, reportStatusLabel } from '../lib/messages';
import { ApprovalActions } from '../components/ApprovalActions';
import { NewFormUpload } from '../components/NewFormUpload';
import { NewDecisionForm } from '../components/NewDecisionForm';
import { NewCorrespondenceSheet } from '../components/NewCorrespondenceSheet';
import { CaseSteps } from '../components/CaseSteps';
import { MisaNumberPanels, ReturnPanel, SignStampPanels } from '../components/CaseStagePanels';
import { CaseActions } from '../components/CaseActions';
import { ChangeDecision } from '../components/ChangeRequestRow';
import {
  NewEnforcementSheet,
  NewServiceSheet,
  NewVerificationSheet,
} from '../components/NewCaseSheets';
import { ServiceResultSheet } from '../components/ServiceResult';
import { VerificationActions } from '../components/VerificationActions';
import { EnforcementActions } from '../components/EnforcementActions';
import { NewCaseForm } from '../components/NewCaseForm';
import { messageFor } from '../lib/messages';

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
  push.mockClear();
  refresh.mockClear();
});

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('LoginForm', () => {
  const fill = () => {
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.test' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'mat-khau-gia-lap' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
  };

  it('sends the configured tenant with the credentials and goes home on success', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED' }));
    render(<LoginForm tenantId="t-1" />);
    fill();
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/auth/login');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      tenantId: 't-1',
      email: 'a@example.test',
      password: 'mat-khau-gia-lap',
    });
  });

  it('shows a clear message for wrong credentials and for a locked account', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    spy.mockImplementationOnce(() => reply(401, { code: 'INVALID_CREDENTIALS' }));
    render(<LoginForm tenantId="t-1" />);
    fill();
    expect((await screen.findByRole('alert')).textContent).toBe('Email hoặc mật khẩu không đúng.');
    spy.mockImplementationOnce(() => reply(429, { code: 'ACCOUNT_LOCKED' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('tạm khoá 15 phút'),
    );
    expect(push).not.toHaveBeenCalled();
  });
});

describe('NewCaseForm', () => {
  const branches = [{ id: 'b1', officeId: 'o1', name: 'CN1' }];
  const fill = () => {
    fireEvent.change(screen.getByLabelText('Mã tham chiếu khách hàng'), {
      target: { value: 'KH-1' },
    });
    fireEvent.change(screen.getByLabelText('Tiêu đề hồ sơ'), {
      target: { value: 'Hồ sơ giả lập' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp nhận hồ sơ' }));
  };

  it('creates the customer, then the case in the chosen branch, and refreshes the list', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => reply(200, { code: 'ALLOWED', label: 'cust-1' }))
      .mockImplementationOnce(() => reply(200, { code: 'ALLOWED', label: 'case-1' }));
    render(<NewCaseForm branches={branches} />);
    fill();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(spy.mock.calls.map((c) => c[0])).toEqual(['/api/vibang/customers', '/api/vibang/cases']);
    expect(JSON.parse((spy.mock.calls[1]![1] as RequestInit).body as string)).toMatchObject({
      officeId: 'o1',
      branchId: 'b1',
      customerId: 'cust-1',
      title: 'Hồ sơ giả lập',
    });
  });

  it('saves name, phone and ID number on the customer before creating the case', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => reply(200, { code: 'ALLOWED', label: 'cust-1' }))
      .mockImplementationOnce(() => reply(200, { code: 'ALLOWED', label: 'cust-1' }))
      .mockImplementationOnce(() => reply(200, { code: 'ALLOWED', label: 'case-1' }));
    render(<NewCaseForm branches={branches} />);
    fireEvent.change(screen.getByLabelText('Tên khách hàng'), { target: { value: 'Nguyễn An' } });
    fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: '0900000001' } });
    fireEvent.change(screen.getByLabelText('Số định danh cá nhân'), {
      target: { value: '001099000001' },
    });
    fill();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(spy.mock.calls.map((c) => c[0])).toEqual([
      '/api/vibang/customers',
      '/api/vibang/customers/cust-1/profile',
      '/api/vibang/cases',
    ]);
    expect(JSON.parse((spy.mock.calls[1]![1] as RequestInit).body as string)).toEqual({
      displayName: 'Nguyễn An',
      phone: '0900000001',
      idNumber: '001099000001',
    });
  });

  it('asks for the customer name when only a phone number is given', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      reply(200, { code: 'ALLOWED', label: 'cust-1' }),
    );
    render(<NewCaseForm branches={branches} />);
    fireEvent.change(screen.getByLabelText('Số điện thoại'), { target: { value: '0900000001' } });
    fill();
    expect((await screen.findByRole('alert')).textContent).toContain('Cần nhập tên khách hàng');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows the server reason and does not create a case when the customer step is denied', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(403, { code: 'ROLE_LACKS_PERMISSION' }));
    render(<NewCaseForm branches={branches} />);
    fill();
    expect((await screen.findByRole('alert')).textContent).toContain('Vai trò của bạn không được');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('explains when there is no branch to use', () => {
    render(<NewCaseForm branches={[]} />);
    expect(screen.getByText(/chưa có chi nhánh/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('messageFor', () => {
  it('maps known codes and keeps unknown ones visible', () => {
    expect(messageFor('BRANCH_NOT_GRANTED')).toContain('chưa được cấp quyền');
    expect(messageFor('SOMETHING_NEW')).toContain('SOMETHING_NEW');
    expect(messageFor(undefined)).toContain('thử lại');
  });
});

describe('CaseActions', () => {
  const props = { caseId: 'c1', title: 'T', description: 'D', isFinal: false, canCancel: true };

  it('edits directly inside the 48-hour window', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED' }));
    render(<CaseActions {...props} windowOpen />);
    fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: 'Mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/vibang/cases/c1/details');
    expect((init as RequestInit).method).toBe('PUT');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      title: 'Mới',
      description: 'D',
    });
  });

  it('files a change request after 48 hours and shows server denials in Vietnamese', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    spy.mockImplementationOnce(() => reply(403, { code: 'ROLE_LACKS_PERMISSION' }));
    render(<CaseActions {...props} windowOpen={false} canCancel={false} />);
    expect(screen.queryByRole('button', { name: 'Huỷ hồ sơ' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Giá trị mới'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Sai chính tả' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề nghị' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Vai trò của bạn không được thực hiện thao tác này.',
    );
    expect(spy.mock.calls[0]![0]).toBe('/api/vibang/cases/c1/change-requests');
  });

  it('hides editing for finished cases', () => {
    render(<CaseActions {...props} windowOpen isFinal canCancel />);
    expect(screen.getByText(/không thể sửa/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Huỷ hồ sơ' })).toBeNull();
  });
});

describe('ChangeDecision', () => {
  it('lets only Admin decide and posts the decision', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED' }));
    const { unmount } = render(<ChangeDecision requestId="r1" canDecide={false} />);
    expect(screen.queryByRole('button', { name: 'Duyệt' })).toBeNull();
    unmount();
    render(<ChangeDecision requestId="r1" canDecide />);
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/vibang/change-requests/r1/decision');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ accept: false });
  });
});

describe('AssignThv', () => {
  const options = [
    { userId: 'u1', label: 'thv1@example.test' },
    { userId: 'u2', label: 'thv2@example.test' },
  ];

  it('assigns a first THV without a reason', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED' }));
    render(<AssignThv caseId="c1" options={options} currentThvId={null} />);
    expect(screen.queryByLabelText('Lý do đổi')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/vibang/cases/c1/responsible-thv');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ thvUserId: 'u1' });
  });

  it('requires a reason to change THV and shows server errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      reply(409, { code: 'ALREADY_ASSIGNED' }),
    );
    render(<AssignThv caseId="c1" options={options} currentThvId="u1" />);
    fireEvent.change(screen.getByLabelText('Lý do đổi'), { target: { value: 'Nghỉ phép' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Hồ sơ đã giao cho THV này.');
  });
});

const progressBase = {
  misaStatus: 'NOT_CONFIRMED',
  misaRevokeStatus: 'NONE',
  numberLabel: null,
  signedAt: null,
  stampedAt: null,
  hasFinalScan: false,
};
const stampedProgress = {
  ...progressBase,
  misaStatus: 'CONFIRMED_FULL',
  numberLabel: '1/2026',
  signedAt: '2026-10-01T00:00:00Z',
  stampedAt: '2026-10-01T00:00:00Z',
};

describe('CaseSteps', () => {
  it('lists the steps and links to the screen of the next one', () => {
    render(<CaseSteps caseId="c1" status="INTAKE" progress={progressBase} />);
    expect(screen.getByRole('link', { name: /Xác nhận MISA và cấp số/ }).getAttribute('href')).toBe(
      '/vi-bang/c1/cap-so',
    );
    cleanup();
    render(
      <CaseSteps
        caseId="c1"
        status="ASSIGNED"
        progress={{ ...stampedProgress, hasFinalScan: false }}
      />,
    );
    expect(screen.getByRole('link', { name: /Ký, đóng dấu/ }).getAttribute('href')).toBe(
      '/vi-bang/c1/ky-dong-dau',
    );
    cleanup();
    render(
      <CaseSteps
        caseId="c1"
        status="ASSIGNED"
        progress={{ ...stampedProgress, hasFinalScan: true }}
      />,
    );
    expect(screen.getByRole('link', { name: /Trả kết quả/ }).getAttribute('href')).toBe(
      '/vi-bang/c1/tra-ket-qua',
    );
  });

  it('offers no next screen for a finished case', () => {
    render(<CaseSteps caseId="c1" status="RETURNED" progress={progressBase} />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('MisaNumberPanels', () => {
  it('lets accounting confirm MISA with a reference', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED' }));
    render(
      <MisaNumberPanels caseId="c1" status="INTAKE" progress={progressBase} roles={['KE_TOAN']} />,
    );
    expect(screen.queryByRole('button', { name: 'Cấp số' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Mã tham chiếu MISA'), { target: { value: 'MISA-1' } });
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận đã thu đủ/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/vibang/cases/c1/misa');
    expect((init as RequestInit).method).toBe('PUT');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      status: 'CONFIRMED_FULL',
      reference: 'MISA-1',
    });
  });

  it('offers numbering only after MISA, to the roles that may number', () => {
    const misaDone = { ...progressBase, misaStatus: 'CONFIRMED_FULL' };
    render(
      <MisaNumberPanels caseId="c1" status="INTAKE" progress={misaDone} roles={['VAN_THU']} />,
    );
    expect(screen.getByRole('button', { name: 'Cấp số' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Xác nhận đã thu đủ/ })).toBeNull();
    cleanup();
    render(<MisaNumberPanels caseId="c1" status="INTAKE" progress={misaDone} roles={['THV']} />);
    expect(screen.queryByRole('button', { name: 'Cấp số' })).toBeNull();
  });
});

describe('SignStampPanels', () => {
  it('uploads the final scan as a raw PDF once the stamp is confirmed', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED' }));
    render(
      <SignStampPanels
        caseId="c1"
        status="ASSIGNED"
        progress={stampedProgress}
        roles={['VAN_THU']}
      />,
    );
    const file = new File(['%PDF-1.4'], 'scan.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/Bản scan cuối \(PDF/), { target: { files: [file] } });
    // jsdom không phản ánh `files` gán bằng fireEvent vào kiểm tra `required`, nên gửi form trực tiếp.
    fireEvent.submit(screen.getByRole('button', { name: 'Tải bản scan cuối' }).closest('form')!);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/vibang/cases/c1/final-scan');
    expect((init as RequestInit).headers).toEqual({ 'content-type': 'application/pdf' });
    expect((init as RequestInit).body).toBe(file);
  });

  it('hides the upload before the stamp and for roles that cannot upload', () => {
    render(
      <SignStampPanels caseId="c1" status="ASSIGNED" progress={progressBase} roles={['VAN_THU']} />,
    );
    expect(screen.queryByRole('button', { name: 'Tải bản scan cuối' })).toBeNull();
    cleanup();
    render(
      <SignStampPanels
        caseId="c1"
        status="ASSIGNED"
        progress={stampedProgress}
        roles={['KE_TOAN']}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Tải bản scan cuối' })).toBeNull();
  });

  it('offers signing to the THV and stamping to the clerk by progress', () => {
    const numbered = { ...progressBase, numberLabel: '1/2026' };
    render(<SignStampPanels caseId="c1" status="ASSIGNED" progress={numbered} roles={['THV']} />);
    expect(screen.getByRole('button', { name: 'Xác nhận đã ký' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Xác nhận đã đóng dấu' })).toBeNull();
    cleanup();
    const signed = { ...numbered, signedAt: '2026-10-12T01:00:00Z' };
    render(<SignStampPanels caseId="c1" status="ASSIGNED" progress={signed} roles={['VAN_THU']} />);
    expect(screen.queryByRole('button', { name: 'Xác nhận đã ký' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Xác nhận đã đóng dấu' })).toBeTruthy();
  });

  it('shows no actions for a finished case', () => {
    render(
      <SignStampPanels caseId="c1" status="RETURNED" progress={progressBase} roles={['ADMIN']} />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ReturnPanel', () => {
  it('explains refusals when returning the result', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      reply(409, { code: 'FINAL_SCAN_MISSING' }),
    );
    render(
      <ReturnPanel
        caseId="c1"
        status="ASSIGNED"
        progress={stampedProgress}
        roles={[]}
        contacts={[]}
        handover={{ recipient: null, on: null }}
      />,
    );
    expect(screen.getByText('CHƯA ĐỦ ĐIỀU KIỆN TRẢ KẾT QUẢ')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đã trả kết quả' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Chưa có bản scan cuối của Vi bằng.',
    );
  });

  it('says the case is ready once stamped and scanned, and offers nothing when finished', () => {
    render(
      <ReturnPanel
        caseId="c1"
        status="ASSIGNED"
        progress={{ ...stampedProgress, hasFinalScan: true }}
        roles={[]}
        contacts={[]}
        handover={{ recipient: null, on: null }}
      />,
    );
    expect(screen.getByText('ĐỦ ĐIỀU KIỆN TRẢ KẾT QUẢ')).toBeTruthy();
    cleanup();
    render(
      <ReturnPanel
        caseId="c1"
        status="RETURNED"
        progress={progressBase}
        roles={[]}
        contacts={[]}
        handover={{ recipient: null, on: null }}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ReportExport', () => {
  it('links to the server Excel and PDF exports with the filters', () => {
    render(
      <ReportExport
        rows={[['a'], ['b']]}
        filename="x.csv"
        server={{ path: '/office/report/export', params: { officeId: 'o1', from: '2026-10-01' } }}
      />,
    );
    expect(screen.getByRole('link', { name: 'Xuất Excel' }).getAttribute('href')).toBe(
      '/api/office/report/export?officeId=o1&from=2026-10-01&format=xlsx',
    );
    expect(screen.getByRole('link', { name: 'Xuất PDF' }).getAttribute('href')).toContain(
      'format=pdf',
    );
  });
});

describe('Handover record', () => {
  it('posts recipient and date, and shows a recorded handover read-only', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply(200, {}));
    render(
      <ReturnPanel
        caseId="c1"
        status="STAMPED"
        progress={stampedProgress}
        roles={['VAN_THU']}
        contacts={[]}
        handover={{ recipient: null, on: null }}
      />,
    );
    fireEvent.change(screen.getByLabelText('Người nhận kết quả'), {
      target: { value: 'Nguyễn An' },
    });
    fireEvent.change(screen.getByLabelText('Ngày bàn giao'), { target: { value: '2026-10-16' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu người nhận' }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toBe('/api/vibang/cases/c1/handover');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      recipientName: 'Nguyễn An',
      handedOverOn: '2026-10-16',
    });
    cleanup();
    render(
      <ReturnPanel
        caseId="c1"
        status="RETURNED"
        progress={stampedProgress}
        roles={['VAN_THU']}
        contacts={[]}
        handover={{ recipient: 'Nguyễn An', on: '2026-10-16' }}
      />,
    );
    expect(screen.getByText('Nguyễn An')).toBeTruthy();
    expect(screen.queryByLabelText('Ngày bàn giao')).toBeNull();
  });
});

describe('Service of documents', () => {
  it('creates a request then its first document with an ISO deadline', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    spy.mockImplementationOnce(() => reply(200, { code: 'ALLOWED', label: 'r1' }));
    spy.mockImplementationOnce(() => reply(200, { code: 'ALLOWED', label: 'd1' }));
    render(<NewServiceSheet branches={[{ id: 'b1', officeId: 'o1', name: 'CN1' }]} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Tạo yêu cầu tống đạt' }));
    fireEvent.change(screen.getByLabelText('Mã yêu cầu'), { target: { value: 'N-01/1' } });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục: Người nhận/ }));
    fireEvent.change(screen.getByLabelText('Người nhận'), { target: { value: 'Người giả lập' } });
    fireEvent.change(screen.getByLabelText('Địa chỉ'), { target: { value: 'Địa chỉ giả lập' } });
    fireEvent.change(screen.getByLabelText('Hạn tống đạt'), {
      target: { value: '2026-12-01T10:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục: Xác nhận/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Tạo yêu cầu' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(spy.mock.calls[0]![0]).toBe('/api/service-of-documents/requests');
    expect(spy.mock.calls[1]![0]).toBe('/api/service-of-documents/requests/r1/documents');
    const body = JSON.parse((spy.mock.calls[1]![1] as RequestInit).body as string);
    expect(body.recipientName).toBe('Người giả lập');
    expect(body.deadlineAt).toMatch(/Z$/);
  });

  it('records a failed attempt from the result sheet and explains refusals', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(403, { code: 'NOT_ASSIGNED_HANDLER' }));
    render(<ServiceResultSheet documentId="d1" attempts={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận kết quả lần tống đạt' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Lưu lần thử thứ 2' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Bạn không phải người phụ trách hồ sơ này.',
    );
    expect(spy.mock.calls[0]![0]).toBe('/api/service-of-documents/documents/d1/attempts');
    expect(JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      outcome: 'ABSENT',
    });
  });

  it('cannot conclude "undeliverable" before any attempt', async () => {
    render(<ServiceResultSheet documentId="d1" attempts={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận kết quả lần tống đạt' }));
    const option = await screen.findByRole('radio', { name: /Không thể tống đạt được/ });
    expect((option as HTMLInputElement).disabled).toBe(true);
  });

  it('sends the evidence file as the raw body with its own content type', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED' }));
    render(<ServiceResultSheet documentId="d1" attempts={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận kết quả lần tống đạt' }));
    fireEvent.click(await screen.findByRole('radio', { name: /Đã đưa được văn bản/ }));
    const file = new File(['x'], 'bien-ban.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/Bằng chứng đã tống đạt/), {
      target: { files: [file] },
    });
    // jsdom không phản ánh `files` gán bằng fireEvent vào kiểm tra `required`, nên gửi form trực tiếp.
    fireEvent.submit(screen.getByRole('button', { name: 'Xác nhận đã tống đạt' }).closest('form')!);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/service-of-documents/documents/d1/served');
    expect((init as RequestInit).headers).toEqual({ 'content-type': 'image/png' });
    expect((init as RequestInit).body).toBe(file);
  });
});

describe('Verification', () => {
  it('opens a verification case in the chosen branch', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED', label: 'c1' }));
    render(<NewVerificationSheet branches={[{ id: 'b1', officeId: 'o1', name: 'CN1' }]} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Mở hồ sơ xác minh' }));
    fireEvent.change(screen.getByLabelText('Mã hồ sơ'), { target: { value: 'XM/1' } });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục: Xác nhận/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mở hồ sơ' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(spy.mock.calls[0]![0]).toBe('/api/verification/cases');
    expect(JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      officeId: 'o1',
      branchId: 'b1',
      caseRef: 'XM/1',
    });
  });

  it('offers round and proposal while open, decision while proposed, and explains refusals', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(409, { code: 'ROUNDS_INCOMPLETE' }));
    const { unmount } = render(<VerificationActions caseId="c1" status="OPEN" rounds={[]} />);
    expect(screen.queryByRole('button', { name: 'Chấp nhận kết luận' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Đề xuất kết luận'), {
      target: { value: 'Đủ điều kiện' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất kết luận' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Còn lượt xác minh chưa hoàn thành.',
    );
    expect(spy.mock.calls[0]![0]).toBe('/api/verification/cases/c1/conclusion-proposal');
    unmount();
    render(<VerificationActions caseId="c1" status="CONCLUSION_PROPOSED" rounds={[]} />);
    expect(screen.queryByRole('button', { name: 'Thêm lượt xác minh' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Trả về để xác minh tiếp' }));
    await waitFor(() => expect(spy.mock.calls.length).toBe(2));
    expect(JSON.parse((spy.mock.calls[1]![1] as RequestInit).body as string)).toEqual({
      approve: false,
    });
  });

  it('shows no actions for a concluded case', () => {
    render(<VerificationActions caseId="c1" status="CONCLUDED" rounds={[]} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Enforcement', () => {
  it('opens an enforcement case with its references', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED', label: 'c1' }));
    render(<NewEnforcementSheet branches={[{ id: 'b1', officeId: 'o1', name: 'CN1' }]} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Mở hồ sơ tổ chức THA' }));
    fireEvent.change(screen.getByLabelText('Mã hồ sơ'), { target: { value: 'THA/1' } });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục: Căn cứ/ }));
    fireEvent.change(screen.getByLabelText('Tham chiếu hợp đồng dịch vụ'), {
      target: { value: 'HĐ-1' },
    });
    fireEvent.change(screen.getByLabelText('Tham chiếu quyết định hoặc bản án'), {
      target: { value: 'QĐ-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục: Xác nhận/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mở hồ sơ' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(spy.mock.calls[0]![0]).toBe('/api/enforcement-cases');
    expect(JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      officeId: 'o1',
      branchId: 'b1',
      caseRef: 'THA/1',
      agreementRef: 'HĐ-1',
      decisionRef: 'QĐ-1',
    });
  });

  it('adds a party and sends a note with its own idempotency key', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED' }));
    render(
      <EnforcementActions
        caseId="c1"
        status="OPEN"
        obligations={[{ id: 'o1', seq: 1, description: 'Nghĩa vụ' }]}
      />,
    );
    fireEvent.change(screen.getByLabelText('Tên đương sự'), {
      target: { value: 'Đương sự giả lập' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm đương sự' }));
    await waitFor(() => expect(spy.mock.calls.length).toBe(1));
    expect(spy.mock.calls[0]![0]).toBe('/api/enforcement-cases/c1/parties');
    expect(JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      displayName: 'Đương sự giả lập',
      kind: 'PERSON',
      role: 'DEBTOR',
    });
    fireEvent.change(screen.getByLabelText('Ghi chú diễn biến'), {
      target: { value: 'Đã liên hệ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ghi chú' }));
    await waitFor(() => expect(spy.mock.calls.length).toBe(2));
    const note = JSON.parse((spy.mock.calls[1]![1] as RequestInit).body as string);
    expect(spy.mock.calls[1]![0]).toBe('/api/enforcement-cases/obligations/o1/events');
    expect(note).toMatchObject({ kind: 'NOTE', note: 'Đã liên hệ' });
    expect(note.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('explains server refusals and hides actions on completed cases', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      reply(403, { code: 'NOT_ASSIGNED_HANDLER' }),
    );
    const { unmount } = render(<EnforcementActions caseId="c1" status="OPEN" obligations={[]} />);
    fireEvent.change(screen.getByLabelText('Nghĩa vụ'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm nghĩa vụ' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Bạn không phải người phụ trách hồ sơ này.',
    );
    expect(screen.queryByLabelText('Ghi chú diễn biến')).toBeNull();
    unmount();
    render(<EnforcementActions caseId="c1" status="COMPLETED" obligations={[]} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Evidence uploads', () => {
  const file = new File(['x'], 'bang-chung.png', { type: 'image/png' });
  // jsdom không phản ánh `files` gán bằng fireEvent vào kiểm tra `required`, nên gửi form trực tiếp.
  const submit = (name: string) =>
    fireEvent.submit(screen.getByRole('button', { name }).closest('form')!);

  it('verification: records a source file for the chosen round, then completes the round', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED' }));
    const rounds = [
      { id: 'r1', seq: 1, partyName: 'Bên A', status: 'COMPLETED' },
      { id: 'r2', seq: 2, partyName: 'Bên B', status: 'IN_PROGRESS' },
    ];
    render(<VerificationActions caseId="c1" status="OPEN" rounds={rounds} />);
    fireEvent.change(screen.getByLabelText('Loại nguồn'), { target: { value: 'Biên bản' } });
    fireEvent.change(screen.getByLabelText('Mục đích sử dụng'), { target: { value: 'Đối chiếu' } });
    fireEvent.change(screen.getByLabelText(/Tệp nguồn/), { target: { files: [file] } });
    submit('Ghi nguồn kèm tệp');
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = spy.mock.calls[0]!;
    expect(String(url).startsWith('/api/verification/rounds/r2/source-files?')).toBe(true);
    expect(new URL(String(url), 'http://x').searchParams.get('confidentiality')).toBe(
      'CONFIDENTIAL',
    );
    expect((init as RequestInit).body).toBe(file);

    fireEvent.change(screen.getByLabelText('Kết quả của lượt'), {
      target: { value: 'Đã đối chiếu' },
    });
    submit('Ghi kết quả lượt');
    await waitFor(() => expect(spy.mock.calls.length).toBe(2));
    expect(spy.mock.calls[1]![0]).toBe('/api/verification/rounds/r2/completion');
    expect(JSON.parse((spy.mock.calls[1]![1] as RequestInit).body as string)).toEqual({
      result: 'Đã đối chiếu',
    });
  });

  it('verification: offers no round actions when every round is done', () => {
    const rounds = [{ id: 'r1', seq: 1, partyName: 'Bên A', status: 'COMPLETED' }];
    render(<VerificationActions caseId="c1" status="OPEN" rounds={rounds} />);
    expect(screen.queryByRole('button', { name: 'Ghi kết quả lượt' })).toBeNull();
  });

  it('enforcement: sends a result with its file and an idempotency key', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED' }));
    render(
      <EnforcementActions
        caseId="c1"
        status="OPEN"
        obligations={[{ id: 'o1', seq: 1, description: 'Trả tiền' }]}
      />,
    );
    fireEvent.change(screen.getByLabelText('Nội dung kết quả'), { target: { value: 'Đã thu' } });
    fireEvent.change(screen.getByLabelText(/Tệp chứng cứ \(PDF/), { target: { files: [file] } });
    submit('Ghi kết quả kèm chứng cứ');
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = spy.mock.calls[0]!;
    const u = new URL(String(url), 'http://x');
    expect(u.pathname).toBe('/api/enforcement-cases/obligations/o1/event-files');
    expect(u.searchParams.get('kind')).toBe('PARTIAL_RESULT');
    expect(u.searchParams.get('note')).toBe('Đã thu');
    expect(u.searchParams.get('idempotencyKey')).toBeTruthy();
    expect((init as RequestInit).body).toBe(file);
  });

  it('enforcement: completes the case with a file and explains a refusal', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(409, { code: 'OBLIGATIONS_NOT_COMPLETE' }));
    render(<EnforcementActions caseId="c1" status="OPEN" obligations={[]} />);
    fireEvent.change(screen.getByLabelText(/Tệp chứng cứ hoàn tất/), { target: { files: [file] } });
    submit('Hoàn tất hồ sơ');
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Còn nghĩa vụ chưa hoàn tất, chưa hoàn tất hồ sơ được.',
    );
    expect(spy.mock.calls[0]![0]).toBe('/api/enforcement-cases/c1/completion-file');
  });
});

describe('AssignHandler', () => {
  const options = [
    { userId: 'u1', label: 'thv1@example.test' },
    { userId: 'u2', label: 'thv2@example.test' },
  ];

  it('renders nothing without options (non-admin)', () => {
    const { container } = render(<AssignHandler path="x/handler" options={[]} currentId={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('PUTs the chosen THV to the given path and refreshes', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED' }));
    render(<AssignHandler path="verification/cases/c1/handler" options={options} currentId="u1" />);
    fireEvent.click(screen.getByRole('radio', { name: /thv2@example.test/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/verification/cases/c1/handler');
    expect((init as RequestInit).method).toBe('PUT');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ handlerUserId: 'u2' });
  });

  it('explains a refusal', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply(409, { code: 'INVALID_HANDLER' }));
    render(<AssignHandler path="x/handler" options={options} currentId={null} />);
    expect(screen.getByText('Giao THV phụ trách')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Người này không phải THV hợp lệ.');
  });
});

describe('Correspondence', () => {
  const branches = [{ id: 'b1', officeId: 'o1', name: 'CN1' }];

  it('registers an inbound letter with its received date', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED', label: 'c1' }));
    render(<NewCorrespondenceSheet branches={branches} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Tạo công văn' }));
    fireEvent.change(screen.getByLabelText(/Loại văn bản \(/), { target: { value: 'Công văn' } });
    fireEvent.change(screen.getByLabelText('Nơi gửi'), { target: { value: 'Tòa án' } });
    fireEvent.change(screen.getByLabelText('Trích yếu'), { target: { value: 'Yêu cầu' } });
    fireEvent.click(screen.getByLabelText('Ngày nhận'));
    fireEvent.click(within(screen.getByRole('grid')).getAllByRole('button')[12]!);
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục: Đính kèm/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục: Xác nhận/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Vào sổ' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/office/correspondence');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      officeId: 'o1',
      branchId: 'b1',
      direction: 'INBOUND',
      docType: 'Công văn',
      counterparty: 'Tòa án',
      subject: 'Yêu cầu',
      receivedOn: '2026-10-13',
    });
  });

  it('drafts an outbound letter without a received date or number', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED', label: 'c1' }));
    render(<NewCorrespondenceSheet branches={branches} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Tạo công văn' }));
    fireEvent.change(screen.getByLabelText('Loại văn bản'), { target: { value: 'OUTBOUND' } });
    expect(screen.queryByLabelText('Ngày nhận')).toBeNull();
    fireEvent.change(screen.getByLabelText(/Loại văn bản \(/), { target: { value: 'Công văn' } });
    fireEvent.change(screen.getByLabelText('Nơi nhận'), { target: { value: 'Cơ quan A' } });
    fireEvent.change(screen.getByLabelText('Trích yếu'), { target: { value: 'Trả lời' } });
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục: Đính kèm/ }));
    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục: Xác nhận/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Vào sổ' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const body = JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.direction).toBe('OUTBOUND');
    expect(body.receivedOn).toBeUndefined();
  });

  it('shows only the next step for each status', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(409, { code: 'INVALID_STATUS' }));
    const { unmount } = render(
      <CorrespondenceActions id="c1" direction="OUTBOUND" status="DRAFT" />,
    );
    expect(screen.queryByRole('button', { name: 'Duyệt' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Trình duyệt' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Trạng thái công văn chưa phù hợp cho bước này.',
    );
    expect(spy.mock.calls[0]![0]).toBe('/api/office/correspondence/c1/submission');
    unmount();
    render(<CorrespondenceActions id="c1" direction="OUTBOUND" status="SUBMITTED" />);
    expect(screen.getByRole('button', { name: 'Duyệt' })).toBeTruthy();
    cleanup();
    render(<CorrespondenceActions id="c1" direction="OUTBOUND" status="ISSUED" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('attaches the final document and issues with a proof file', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED' }));
    const file = new File(['x'], 'ban-cuoi.pdf', { type: 'application/pdf' });
    const { unmount } = render(
      <CorrespondenceActions id="c1" direction="OUTBOUND" status="DRAFT" />,
    );
    fireEvent.change(screen.getByLabelText(/Bản cuối của công văn/), { target: { files: [file] } });
    fireEvent.submit(screen.getByRole('button', { name: 'Đính kèm bản cuối' }).closest('form')!);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(String(spy.mock.calls[0]![0])).toBe(
      '/api/office/correspondence/c1/attachment-files?role=FINAL_DOCUMENT',
    );
    unmount();
    render(<CorrespondenceActions id="c1" direction="OUTBOUND" status="APPROVED" />);
    fireEvent.change(screen.getByLabelText('Số, ký hiệu'), { target: { value: '12/CV' } });
    fireEvent.change(screen.getByLabelText('Ngày ban hành'), { target: { value: '2026-10-13' } });
    fireEvent.change(screen.getByLabelText('Hình thức gửi'), { target: { value: 'Bưu điện' } });
    fireEvent.change(screen.getByLabelText(/Chứng từ gửi đi/), { target: { files: [file] } });
    fireEvent.submit(screen.getByRole('button', { name: 'Ban hành' }).closest('form')!);
    await waitFor(() => expect(spy.mock.calls.length).toBe(2));
    const u = new URL(String(spy.mock.calls[1]![0]), 'http://x');
    expect(u.pathname).toBe('/api/office/correspondence/c1/issuance-file');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      refNo: '12/CV',
      issuedOn: '2026-10-13',
      sendMethod: 'Bưu điện',
    });
    expect((spy.mock.calls[1]![1] as RequestInit).body).toBe(file);
  });
});

describe('NewDecisionForm', () => {
  const branches = [{ id: 'b1', name: 'CN1', officeId: 'o1' }] as never;
  const signers = [{ userId: 'u1', label: 'ky@example.test' }];
  const fill = () => {
    fireEvent.change(screen.getByLabelText('Số quyết định'), { target: { value: 'QD-01' } });
    fireEvent.change(screen.getByLabelText('Loại văn bản'), { target: { value: 'Quyết định' } });
    fireEvent.change(screen.getByLabelText('Trích yếu'), { target: { value: 'Giả lập' } });
    fireEvent.change(screen.getByLabelText('Người ký'), { target: { value: 'u1' } });
    fireEvent.change(screen.getByLabelText('Ngày ký'), { target: { value: '2026-10-13' } });
  };

  it('uploads the signed file with the fields in the query', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED', label: 'd1' }));
    const { container } = render(<NewDecisionForm branches={branches} signers={signers} />);
    fill();
    const file = new File(['x'], 'qd.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/Bản đã ký/), { target: { files: [file] } });
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const url = new URL(String(spy.mock.calls[0]![0]), 'http://x');
    expect(url.pathname).toBe('/api/office/decision-files');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      officeId: 'o1',
      branchId: 'b1',
      decisionNo: 'QD-01',
      signerUserId: 'u1',
      signedOn: '2026-10-13',
    });
  });

  it('refuses without a file and shows the duplicate-number message', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(409, { code: 'DUPLICATE_DECISION_NO' }));
    const { container } = render(<NewDecisionForm branches={branches} signers={signers} />);
    fill();
    fireEvent.submit(container.querySelector('form')!);
    expect((await screen.findByRole('alert')).textContent).toBe(messageFor('INVALID_DOCUMENT'));
    expect(spy).not.toHaveBeenCalled();
    const file = new File(['x'], 'qd.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/Bản đã ký/), { target: { files: [file] } });
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Số quyết định này đã có trong sổ.'),
    );
  });

  it('explains when nobody holds signing authority', () => {
    render(<NewDecisionForm branches={branches} signers={[]} />);
    expect(screen.getByText(/Chưa có người được cấp quyền ký/)).toBeTruthy();
  });
});

describe('Stock forms', () => {
  const branches = [{ id: 'b1', name: 'CN1', officeId: 'o1' }] as never;
  const items = [{ itemId: 'i1', name: 'Giấy A4' }];

  it('adds an item', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED', label: 'i1' }));
    render(<NewItemForm officeId="o1" />);
    fireEvent.change(screen.getByLabelText('Tên vật tư'), { target: { value: 'Giấy A4' } });
    fireEvent.change(screen.getByLabelText('Đơn vị tính'), { target: { value: 'ram' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(spy.mock.calls[0]![0]).toBe('/api/office/items');
    expect(JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      officeId: 'o1',
      name: 'Giấy A4',
      unit: 'ram',
    });
  });

  it('receives then issues with the right payload and shows stock errors', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => reply(200, { code: 'ALLOWED', label: 'b1' }))
      .mockImplementationOnce(() => reply(409, { code: 'INSUFFICIENT_STOCK' }));
    render(<StockMovementForm items={items} branches={branches} />);
    fireEvent.change(screen.getByLabelText('Số lượng'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Số phiếu nhập'), { target: { value: 'PN-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Nhập kho' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(spy.mock.calls[0]![0]).toBe('/api/office/items/i1/receipts');
    expect(JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      branchId: 'b1',
      quantity: 5,
      receiptRef: 'PN-1',
    });
    fireEvent.change(screen.getByLabelText('Thao tác'), { target: { value: 'issues' } });
    fireEvent.change(screen.getByLabelText('Số lượng'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Mục đích xuất'), { target: { value: 'Dùng' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xuất kho' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Tồn kho không đủ để xuất.');
    expect(spy.mock.calls[1]![0]).toBe('/api/office/items/i1/issues');
  });

  it('adjusts a batch with a reason', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED', label: '-1' }));
    render(<AdjustBatchForm batchId="bt1" remaining={4} received={10} />);
    fireEvent.change(screen.getByLabelText('Số còn lại mới'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Kiểm kê' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm kê' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(spy.mock.calls[0]![0]).toBe('/api/office/batches/bt1/adjustment');
    expect(JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      newRemaining: 3,
      reason: 'Kiểm kê',
    });
  });
});

describe('NewFormUpload', () => {
  it('uploads a TT06 form with the code and title in the query', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED', label: 'I v1' }));
    const { container } = render(<NewFormUpload officeId="o1" />);
    fireEvent.change(screen.getByLabelText('Phụ lục'), { target: { value: 'III' } });
    fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: 'Mẫu giả lập' } });
    const file = new File(['x'], 'm.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/Tệp biểu mẫu/), { target: { files: [file] } });
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const url = new URL(String(spy.mock.calls[0]![0]), 'http://x');
    expect(url.pathname).toBe('/api/office/tt06-form-files');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      officeId: 'o1',
      code: 'III',
      title: 'Mẫu giả lập',
    });
  });

  it('refuses without a file and shows the API error', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(403, { code: 'ADMIN_OR_HEAD_ONLY' }));
    const { container } = render(<NewFormUpload officeId="o1" />);
    fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: 'x' } });
    fireEvent.submit(container.querySelector('form')!);
    expect((await screen.findByRole('alert')).textContent).toBe(messageFor('INVALID_DOCUMENT'));
    expect(spy).not.toHaveBeenCalled();
    const file = new File(['x'], 'm.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/Tệp biểu mẫu/), { target: { files: [file] } });
    fireEvent.submit(container.querySelector('form')!);
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(messageFor('ADMIN_OR_HEAD_ONLY')),
    );
  });
});

describe('ApprovalActions', () => {
  it('shows decisions only to Admin/Head on open items and resubmit on returned items', () => {
    const { unmount } = render(
      <ApprovalActions kind="TRANSFER" subjectId="t1" state="OPEN" roles={['THV']} />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    unmount();
    const second = render(
      <ApprovalActions kind="TRANSFER" subjectId="t1" state="OPEN" roles={['ADMIN']} />,
    );
    expect(screen.getByRole('button', { name: 'Từ chối' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nộp lại' })).toBeNull();
    second.unmount();
    render(<ApprovalActions kind="TRANSFER" subjectId="t1" state="RETURNED" roles={['THV']} />);
    expect(screen.getByRole('button', { name: 'Nộp lại' })).toBeTruthy();
  });

  it('sends the decision with the reason and surfaces API errors', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => reply(200, { code: 'ALLOWED', label: 'RETURN' }))
      .mockImplementationOnce(() => reply(409, { code: 'ALREADY_REJECTED' }));
    render(<ApprovalActions kind="DELEGATION" subjectId="d1" state="OPEN" roles={['TRUONG_VP']} />);
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'thiếu biên bản' } });
    fireEvent.click(screen.getByRole('button', { name: 'Trả lại bổ sung' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(spy.mock.calls[0]![0]).toBe('/api/approvals/delegations/d1/decisions');
    expect(JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      decision: 'RETURN',
      reason: 'thiếu biên bản',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Đề xuất này đã bị từ chối, cần tạo đề xuất mới.',
    );
  });
});

describe('Report helpers', () => {
  it('labels statuses by domain and unit', () => {
    expect(reportStatusLabel('TONG_DAT', 'REQUEST', 'OPEN')).toBe('Đang mở');
    expect(reportStatusLabel('TONG_DAT', 'DOCUMENT', 'DELIVERED')).toBe('Đã tống đạt');
    expect(reportStatusLabel('XAC_MINH', 'ROUND', 'COMPLETED')).toBe('Đã hoàn thành');
    expect(reportStatusLabel('CONG_VAN', 'CORRESPONDENCE', 'INBOUND:RECEIVED')).toBe(
      'Công văn đến: Đã nhận',
    );
    expect(reportStatusLabel('VAT_TU', 'QUANTITY', 'ISSUE')).toBe('Xuất kho');
    expect(reportStatusLabel('LAO_DONG', 'PERSON', 'LEFT')).toBe('Đã nghỉ');
    expect(reportStatusLabel('THI_HANH_AN', 'OBLIGATION', 'PARTIAL')).not.toBe('PARTIAL');
    expect(reportStatusLabel('VIBANG', 'NUMBER', 'ALLOCATED')).toBe('Đã cấp');
    expect(reportStatusLabel('VIBANG', 'CASE', 'LẠ')).toBe('LẠ');
  });

  it('exports the visible table as quoted CSV with a BOM', async () => {
    const blobs: Blob[] = [];
    vi.stubGlobal('URL', {
      createObjectURL: (b: Blob) => {
        blobs.push(b);
        return 'blob:x';
      },
      revokeObjectURL: () => undefined,
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    render(
      <ReportExport
        filename="r.csv"
        rows={[
          ['Nghiệp vụ', 'Số lượng'],
          ['Vi "bằng"', '3'],
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tải CSV' }));
    expect(click).toHaveBeenCalled();
    const bytes = await new Promise<Uint8Array>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.readAsArrayBuffer(blobs[0]!);
    });
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)).toBe(
      '﻿"Nghiệp vụ","Số lượng"\r\n"Vi ""bằng""","3"',
    );
    vi.unstubAllGlobals();
  });
});

describe('Access requests', () => {
  const branches = [{ id: 'b1', name: 'CN1', officeId: 'o1' }] as never;
  const people = [{ userId: 'u1', label: 'a@example.test' }];

  it('proposes a role grant and a branch grant with the right payload', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED', label: 'r1' }));
    render(<AccessRequestForm officeId="o1" people={people} branches={branches} />);
    fireEvent.change(screen.getByLabelText('Vai trò'), { target: { value: 'KE_TOAN' } });
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'nhân sự mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(spy.mock.calls[0]![0]).toBe('/api/admin/access-requests');
    expect(JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      officeId: 'o1',
      targetUserId: 'u1',
      kind: 'GRANT_ROLE',
      reason: 'nhân sự mới',
      role: 'KE_TOAN',
    });
    fireEvent.change(screen.getByLabelText('Nội dung'), { target: { value: 'GRANT_BRANCH' } });
    expect(screen.queryByLabelText('Vai trò')).toBeNull();
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'cấp CN1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất' }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(JSON.parse((spy.mock.calls[1]![1] as RequestInit).body as string)).toMatchObject({
      kind: 'GRANT_BRANCH',
      branchId: 'b1',
    });
  });

  it('shows the separate-approver error and requires a note to reject', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(403, { code: 'SEPARATE_APPROVER_REQUIRED' }));
    render(<AccessRequestActions id="r1" roles={['TRUONG_VP']} />);
    expect(screen.queryByRole('button', { name: 'Rút đề xuất' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận từ chối' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Cần nhập lý do.');
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Người duyệt phải khác người đề xuất.'),
    );
    expect(spy.mock.calls[0]![0]).toBe('/api/admin/access-requests/r1/decision');
    expect(JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      approve: true,
    });
  });

  it('lets an Admin withdraw and hides actions from other roles', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED', label: null }));
    const { unmount } = render(<AccessRequestActions id="r1" roles={['THU_KY']} />);
    expect(screen.queryByRole('button')).toBeNull();
    unmount();
    render(<AccessRequestActions id="r1" roles={['ADMIN']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rút đề xuất' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(spy.mock.calls[0]![0]).toBe('/api/admin/access-requests/r1/withdrawal');
  });
});

describe('PlaceForm', () => {
  it('posts the trimmed place address and is read-only when the case is final', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(new Response('{"code":"ALLOWED"}', { status: 200 })),
      );
    render(<PlaceForm caseId="case-1" placeAddress={null} canEdit />);
    fireEvent.change(screen.getByLabelText('Nơi lập Vi bằng'), {
      target: { value: '  Số 12 phố Huế  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nơi lập' }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/vibang/cases/case-1/place');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      placeAddress: 'Số 12 phố Huế',
    });
    cleanup();
    render(<PlaceForm caseId="case-1" placeAddress="Hà Nội" canEdit={false} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Hà Nội')).toBeTruthy();
    spy.mockRestore();
  });

  it('labels every history kind the API can return', () => {
    for (const k of [
      'CASE_CREATED',
      'NUMBER_ALLOCATED',
      'SIGNED',
      'HANDOVER',
      'COPY_ISSUED',
      'CANCELLED',
    ]) {
      expect(HISTORY_KIND_LABEL[k]).toBeTruthy();
    }
  });
});

describe('CustomerDirectory Vi bằng column', () => {
  it('shows the number count per customer, dash when unknown', () => {
    const c = (id: string) => ({
      id,
      kind: 'PERSON' as const,
      externalRef: `KH-${id}`,
      displayName: `Khách ${id}`,
      address: null,
    });
    render(
      <CustomerDirectory
        customers={[c('a'), c('b')] as never}
        contracts={[]}
        query=""
        numberCounts={{ a: 3 }}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Vi bằng' })).toBeTruthy();
    const rows = screen.getAllByRole('row');
    expect(rows[1]!.textContent).toContain('3');
    expect(rows[2]!.textContent).toContain('—');
  });
});
