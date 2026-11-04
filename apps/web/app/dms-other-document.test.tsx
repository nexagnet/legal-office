// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UploadDmsFile } from '../components/DmsCaseActions';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  refresh.mockClear();
});

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

/** jsdom không đưa tệp gán qua script vào FormData, nên giả FormData trả đúng tệp đã chọn. */
function submitFile() {
  const file = new File(['x'], 'giay-to.pdf', { type: 'application/pdf' });
  vi.stubGlobal(
    'FormData',
    class {
      get(key: string) {
        return key === 'file' ? file : null;
      }
    },
  );
  fireEvent.submit(screen.getByRole('form', { name: 'Tải tệp lên' }));
}

describe('Ô Tài liệu khác (UploadDmsFile với otherForCaseId)', () => {
  it('chưa có tài liệu: tạo tài liệu trước rồi tải tệp lên chính tài liệu đó', async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      calls.push(String(url));
      return String(url).includes('/other-document')
        ? reply(200, { code: 'DOCUMENT_ADDED', label: 'doc-1' })
        : reply(200, { code: 'FILE_ATTACHED', label: 'f1' });
    });
    render(<UploadDmsFile otherForCaseId="case-1" />);
    submitFile();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(calls[0]).toBe('/api/dms/cases/case-1/other-document');
    expect(calls[1]).toMatch(/^\/api\/dms\/documents\/doc-1\/files\?/);
    expect(calls).toHaveLength(2);
  });

  it('đã có tài liệu: tải thẳng, không gọi tạo tài liệu', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'FILE_ATTACHED', label: 'f1' }));
    render(<UploadDmsFile documentId="doc-9" />);
    submitFile();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0]![0])).toMatch(/^\/api\/dms\/documents\/doc-9\/files\?/);
  });

  it('không tạo được tài liệu (ví dụ không đủ quyền): báo lỗi và không tải tệp', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(403, { code: 'FORBIDDEN', label: null }));
    render(<UploadDmsFile otherForCaseId="case-1" />);
    submitFile();
    await screen.findByRole('alert');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });
});
