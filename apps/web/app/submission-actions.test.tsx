// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AddSubmissionFiles,
  DecideSubmission,
  NewSubmissionButton,
} from '../components/SubmissionActions';
import { stageFiles } from '../lib/stage-upload';

const refresh = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockClear();
  push.mockClear();
});

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const pdf = (name: string) => new File(['%PDF-1.4 x'], name, { type: 'application/pdf' });
const urlOf = (c: unknown[]) => String(c[0]);
const bodyOf = (c: unknown[]) => JSON.parse((c[1] as RequestInit).body as string);

describe('stageFiles', () => {
  it('tải từng tệp lên bước đệm và trả mã tệp đệm kèm tên', async () => {
    let n = 0;
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'UPLOAD_STAGED', label: `s${++n}` }));
    const r = await stageFiles([pdf('a.pdf'), pdf('b.pdf')]);
    expect(r).toEqual({
      ok: true,
      files: [
        { stagedId: 's1', label: 'a.pdf' },
        { stagedId: 's2', label: 'b.pdf' },
      ],
    });
    expect(spy.mock.calls.map(urlOf)).toEqual(['/api/dms/uploads', '/api/dms/uploads']);
  });

  it('dừng ở tệp lỗi đầu tiên và nêu tên tệp', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(422, { code: 'INVALID_INPUT', label: null }));
    const r = await stageFiles([pdf('hong.pdf'), pdf('b.pdf')]);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain('hong.pdf');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('không có tệp hoặc quá 20 tệp thì từ chối ngay, không gọi API', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    expect((await stageFiles([])).ok).toBe(false);
    expect((await stageFiles(Array.from({ length: 21 }, (_, i) => pdf(`${i}.pdf`)))).ok).toBe(
      false,
    );
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('NewSubmissionButton (gửi bản trình, N4)', () => {
  it('tải tệp rồi gửi bản trình với tiêu đề, mô tả và danh sách tệp, sau đó chuyển tới bản trình', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((url) =>
        String(url).endsWith('/uploads')
          ? reply(200, { code: 'UPLOAD_STAGED', label: 'st1' })
          : reply(201, { code: 'SUBMISSION_CREATED', label: 'sub9' }),
      );
    render(<NewSubmissionButton officeId="o1" />);
    fireEvent.click(screen.getByRole('button', { name: '+ Trình mới' }));
    const form = await screen.findByRole('form', { name: 'Trình mới' });
    fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: 'Bổ sung ủy quyền' } });
    fireEvent.change(screen.getByLabelText('Mô tả'), { target: { value: 'Giấy ủy quyền mới' } });
    const input = screen.getByLabelText(/Bản scan/) as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [pdf('uq.pdf')], configurable: true });
    fireEvent.submit(form);
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dms/trinh-duyet/sub9'));
    expect(spy.mock.calls.map(urlOf)).toEqual(['/api/dms/uploads', '/api/dms/submissions']);
    expect(bodyOf(spy.mock.calls[1]!)).toEqual({
      officeId: 'o1',
      title: 'Bổ sung ủy quyền',
      description: 'Giấy ủy quyền mới',
      files: [{ stagedId: 'st1', label: 'uq.pdf' }],
    });
  });

  it('máy chủ từ chối thì báo tiếng Việt và không chuyển trang', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) =>
      String(url).endsWith('/uploads')
        ? reply(200, { code: 'UPLOAD_STAGED', label: 'st1' })
        : reply(403, { code: 'PERMISSION_DENIED', label: null }),
    );
    render(<NewSubmissionButton officeId="o1" />);
    fireEvent.click(screen.getByRole('button', { name: '+ Trình mới' }));
    const form = await screen.findByRole('form', { name: 'Trình mới' });
    fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: 'X' } });
    const input = screen.getByLabelText(/Bản scan/) as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [pdf('a.pdf')], configurable: true });
    fireEvent.submit(form);
    await screen.findByRole('alert');
    expect(push).not.toHaveBeenCalled();
  });
});

describe('AddSubmissionFiles', () => {
  it('tải thêm tệp rồi gắn vào bản trình đã chọn', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((url) =>
        String(url).endsWith('/uploads')
          ? reply(200, { code: 'UPLOAD_STAGED', label: 'st2' })
          : reply(200, { code: 'SUBMISSION_FILES_ADDED', label: null }),
      );
    render(<AddSubmissionFiles submissionId="sub1" />);
    const form = screen.getByRole('form', { name: 'Thêm bản scan' });
    const input = form.querySelector('input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [pdf('them.pdf')], configurable: true });
    fireEvent.submit(form);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(urlOf(spy.mock.calls[1]!)).toBe('/api/dms/submissions/sub1/files');
    expect(bodyOf(spy.mock.calls[1]!)).toEqual({
      files: [{ stagedId: 'st2', label: 'them.pdf' }],
    });
  });
});

describe('DecideSubmission (Admin duyệt / từ chối)', () => {
  it('duyệt gửi approve=true, ghi chú tùy chọn', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'SUBMISSION_APPROVED', label: null }));
    render(<DecideSubmission submissionId="sub1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(urlOf(spy.mock.calls[0]!)).toBe('/api/dms/submissions/sub1/decide');
    expect(bodyOf(spy.mock.calls[0]!)).toEqual({ approve: true });
  });

  it('từ chối bắt buộc có lý do; có lý do thì gửi approve=false kèm note', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'SUBMISSION_REJECTED', label: null }));
    render(<DecideSubmission submissionId="sub1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    expect((await screen.findByRole('alert')).textContent).toContain('lý do');
    expect(spy).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Ghi chú/), { target: { value: 'Thiếu trang 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(bodyOf(spy.mock.calls[0]!)).toEqual({ approve: false, note: 'Thiếu trang 2' });
  });

  it('người không phải Admin bị từ chối thì báo tiếng Việt', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      reply(403, { code: 'PERMISSION_DENIED', label: null }),
    );
    render(<DecideSubmission submissionId="sub1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt' }));
    await screen.findByRole('alert');
    expect(refresh).not.toHaveBeenCalled();
  });
});
