import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from '../components/LoginForm';
import { AssignThv } from '../components/AssignThv';
import { CaseSteps } from '../components/CaseSteps';
import { CaseActions } from '../components/CaseActions';
import { ChangeDecision } from '../components/ChangeRequestRow';
import { NewServiceForm } from '../components/NewServiceForm';
import { ServiceRowActions } from '../components/ServiceRowActions';
import { NewVerificationForm } from '../components/NewVerificationForm';
import { VerificationActions } from '../components/VerificationActions';
import { NewEnforcementForm } from '../components/NewEnforcementForm';
import { EnforcementActions } from '../components/EnforcementActions';
import { NewCaseForm } from '../components/NewCaseForm';
import { messageFor } from '../lib/messages';

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));

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

describe('CaseSteps', () => {
  const base = {
    misaStatus: 'NOT_CONFIRMED',
    misaRevokeStatus: 'NONE',
    numberLabel: null,
    signedAt: null,
    stampedAt: null,
    hasFinalScan: false,
  };

  it('lets accounting confirm MISA with a reference', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED' }));
    render(<CaseSteps caseId="c1" status="INTAKE" progress={base} roles={['KE_TOAN']} />);
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

  it('uploads the final scan as a raw PDF once the stamp is confirmed', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED' }));
    const stamped = {
      ...base,
      numberLabel: '1/2026',
      signedAt: '2026-10-01T00:00:00Z',
      stampedAt: '2026-10-01T00:00:00Z',
    };
    render(<CaseSteps caseId="c1" status="ASSIGNED" progress={stamped} roles={['VAN_THU']} />);
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
    render(<CaseSteps caseId="c1" status="ASSIGNED" progress={base} roles={['VAN_THU']} />);
    expect(screen.queryByRole('button', { name: 'Tải bản scan cuối' })).toBeNull();
    cleanup();
    const stamped = {
      ...base,
      numberLabel: '1/2026',
      signedAt: '2026-10-01T00:00:00Z',
      stampedAt: '2026-10-01T00:00:00Z',
    };
    render(<CaseSteps caseId="c1" status="ASSIGNED" progress={stamped} roles={['KE_TOAN']} />);
    expect(screen.queryByRole('button', { name: 'Tải bản scan cuối' })).toBeNull();
  });

  it('offers the next step by progress and role, and explains refusals', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      reply(409, { code: 'FINAL_SCAN_MISSING' }),
    );
    const done = {
      ...base,
      misaStatus: 'CONFIRMED_FULL',
      numberLabel: '01/2026',
      signedAt: '2026-10-12T01:00:00Z',
      stampedAt: '2026-10-12T02:00:00Z',
    };
    render(<CaseSteps caseId="c1" status="ASSIGNED" progress={done} roles={['VAN_THU']} />);
    expect(screen.queryByRole('button', { name: 'Xác nhận đã ký' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Trả khách' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Chưa có bản scan cuối của Vi bằng.',
    );
  });

  it('shows no actions for a finished case', () => {
    render(<CaseSteps caseId="c1" status="RETURNED" progress={base} roles={['ADMIN']} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Service of documents', () => {
  it('creates a request then its first document with an ISO deadline', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    spy.mockImplementationOnce(() => reply(200, { code: 'ALLOWED', label: 'r1' }));
    spy.mockImplementationOnce(() => reply(200, { code: 'ALLOWED', label: 'd1' }));
    render(<NewServiceForm branches={[{ id: 'b1', officeId: 'o1', name: 'CN1' }]} />);
    fireEvent.change(screen.getByLabelText('Mã yêu cầu'), { target: { value: 'N-01/1' } });
    fireEvent.change(screen.getByLabelText('Người nhận'), { target: { value: 'Người giả lập' } });
    fireEvent.change(screen.getByLabelText('Địa chỉ'), { target: { value: 'Địa chỉ giả lập' } });
    fireEvent.change(screen.getByLabelText('Hạn tống đạt'), {
      target: { value: '2026-12-01T10:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo yêu cầu' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(spy.mock.calls[0]![0]).toBe('/api/service-of-documents/requests');
    expect(spy.mock.calls[1]![0]).toBe('/api/service-of-documents/requests/r1/documents');
    const body = JSON.parse((spy.mock.calls[1]![1] as RequestInit).body as string);
    expect(body.recipientName).toBe('Người giả lập');
    expect(body.deadlineAt).toMatch(/Z$/);
  });

  it('records a failed attempt and explains refusals; finished documents have no actions', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(403, { code: 'NOT_ASSIGNED_HANDLER' }));
    const { unmount } = render(<ServiceRowActions documentId="d1" status="ASSIGNED" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận lần tống đạt' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Bạn không phải người phụ trách hồ sơ này.',
    );
    expect(spy.mock.calls[0]![0]).toBe('/api/service-of-documents/documents/d1/attempts');
    expect(JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      outcome: 'ABSENT',
    });
    unmount();
    render(<ServiceRowActions documentId="d1" status="DELIVERED" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Verification', () => {
  it('opens a verification case in the chosen branch', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED', label: 'c1' }));
    render(<NewVerificationForm branches={[{ id: 'b1', officeId: 'o1', name: 'CN1' }]} />);
    fireEvent.change(screen.getByLabelText('Mã hồ sơ'), { target: { value: 'XM/1' } });
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
    const { unmount } = render(<VerificationActions caseId="c1" status="OPEN" />);
    expect(screen.queryByRole('button', { name: 'Chấp nhận kết luận' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Đề xuất kết luận'), {
      target: { value: 'Đủ điều kiện' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất kết luận' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Còn vòng xác minh chưa hoàn thành.',
    );
    expect(spy.mock.calls[0]![0]).toBe('/api/verification/cases/c1/conclusion-proposal');
    unmount();
    render(<VerificationActions caseId="c1" status="CONCLUSION_PROPOSED" />);
    expect(screen.queryByRole('button', { name: 'Bắt đầu vòng xác minh' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Trả về để xác minh tiếp' }));
    await waitFor(() => expect(spy.mock.calls.length).toBe(2));
    expect(JSON.parse((spy.mock.calls[1]![1] as RequestInit).body as string)).toEqual({
      approve: false,
    });
  });

  it('shows no actions for a concluded case', () => {
    render(<VerificationActions caseId="c1" status="CONCLUDED" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('Enforcement', () => {
  it('opens an enforcement case with its references', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'ALLOWED', label: 'c1' }));
    render(<NewEnforcementForm branches={[{ id: 'b1', officeId: 'o1', name: 'CN1' }]} />);
    fireEvent.change(screen.getByLabelText('Mã hồ sơ'), { target: { value: 'THA/1' } });
    fireEvent.change(screen.getByLabelText('Tham chiếu hợp đồng dịch vụ'), {
      target: { value: 'HĐ-1' },
    });
    fireEvent.change(screen.getByLabelText('Tham chiếu quyết định hoặc bản án'), {
      target: { value: 'QĐ-1' },
    });
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
