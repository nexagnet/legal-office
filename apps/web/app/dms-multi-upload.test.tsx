// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DmsMultiUpload, uploadUnclassified } from '../components/DmsCaseActions';
import { DmsCaseExtrasForm } from '../components/DmsCaseExtrasForm';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockClear();
});

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const pdf = (name: string) => new File(['x'], name, { type: 'application/pdf' });

describe('Tải lên không phân loại, không giới hạn số tệp', () => {
  it('mọi tệp vào tài liệu chung "Tài liệu khác", nhãn là tên tệp, tính là bản scan', async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      calls.push(String(url));
      return String(url).includes('/other-document')
        ? reply(200, { code: 'DOCUMENT_ADDED', label: 'doc-1' })
        : reply(200, { code: 'FILE_ATTACHED', label: 'f' });
    });
    const r = await uploadUnclassified('case-1', [pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')]);
    expect(r).toEqual({ done: 3, error: null });
    expect(calls[0]).toBe('/api/dms/cases/case-1/other-document');
    expect(calls.slice(1)).toHaveLength(3);
    for (const [i, n] of ['a.pdf', 'b.pdf', 'c.pdf'].entries()) {
      const q = new URL(calls[i + 1]!, 'http://x').searchParams;
      expect(calls[i + 1]).toMatch(/^\/api\/dms\/documents\/doc-1\/files\?/);
      expect(q.get('label')).toBe(n);
      expect(q.get('isScan')).toBe('true');
    }
  });

  it('một tệp lỗi: dừng, báo tên tệp và số tệp đã tải', async () => {
    let n = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) =>
      String(url).includes('/other-document')
        ? reply(200, { code: 'DOCUMENT_ADDED', label: 'doc-1' })
        : ++n === 2
          ? reply(400, { code: 'FILE_TYPE' })
          : reply(200, { code: 'FILE_ATTACHED' }),
    );
    const r = await uploadUnclassified('case-1', [pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')]);
    expect(r.done).toBe(1);
    expect(r.error).toContain('b.pdf');
  });

  it('ô tải lên cho chọn nhiều tệp và không có ô loại tài liệu', () => {
    render(<DmsMultiUpload caseId="case-1" />);
    expect((screen.getByLabelText('Chọn tệp') as HTMLInputElement).multiple).toBe(true);
    expect(screen.queryByLabelText(/Loại tài liệu/)).toBeNull();
  });
});

describe('Mục C của bản nháp', () => {
  it('lưu Tên hồ sơ, SĐT, Ghi chú và giữ nguyên các cột sổ', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => reply(200, { code: 'CASE_DRAFT_UPDATED' }));
    render(
      <DmsCaseExtrasForm
        caseId="case-1"
        title="Cũ"
        current={{ nguoi_yeu_cau: 'Cty B', so_dien_thoai: '0912345678' }}
        withPhone
      />,
    );
    fireEvent.change(screen.getByLabelText('Tên hồ sơ'), { target: { value: 'Mới' } });
    fireEvent.change(screen.getByLabelText('Ghi chú'), { target: { value: 'n' } });
    fireEvent.submit(screen.getByRole('form', { name: /Thông tin khác/ }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe('/api/dms/cases/case-1/draft');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      title: 'Mới',
      attributes: { nguoi_yeu_cau: 'Cty B', so_dien_thoai: '0912345678', note: 'n' },
    });
  });
});
