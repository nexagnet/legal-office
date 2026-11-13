// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DmsDocumentsTab, groupLabel, type DocGroup } from '../components/DmsDocumentsTab';
import { UploadDialog } from '../components/DmsFileActions';
import type { DmsFileRow } from '../lib/dms';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockClear();
});

const file = (id: string, label: string, version = 1, isScan = true): DmsFileRow => ({
  id,
  label,
  is_scan: isScan,
  version,
  mime: 'application/pdf',
  size_bytes: 2048,
  created_at: '2026-11-12T03:00:00Z',
  ocr_status: 'DONE',
  ocr_pages_done: 3,
  ocr_pages_total: 3,
});
const groups: DocGroup[] = [
  {
    id: 'd1',
    title: 'Vi bằng',
    kind: 'Vi bằng',
    isOfficial: true,
    files: [file('f1', 'main.pdf')],
  },
  {
    id: 'd2',
    title: 'Tài liệu đính kèm',
    kind: 'Tài liệu khác',
    isOfficial: false,
    files: [file('f2', 'bien-ban.pdf', 1), file('f3', 'bien-ban.pdf', 2)],
  },
];
const base = { caseId: 'c1', base: '/dms/vi-bang/c1', canUpload: true, canAddScan: true };

describe('Tab Tài liệu (thiết kế mới)', () => {
  it('nhãn nhóm không lặp chữ', () => {
    expect(groupLabel(groups[0]!)).toBe('Vi bằng · chính thức');
    expect(groupLabel(groups[1]!)).toBe('Tài liệu khác · không vào sổ');
  });

  it('chỉ có một nút Tải lên, mỗi tệp một dòng, bấm tên để xem', () => {
    render(<DmsDocumentsTab {...base} groups={groups} canDeleteScan={false} />);
    expect(screen.getAllByRole('button', { name: /^Tải lên$/ })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Xóa scan' })).toBeNull();
    const link = screen.getByRole('link', { name: 'main.pdf' });
    expect(link.getAttribute('href')).toBe('/dms/vi-bang/c1?tab=tai-lieu&file=f1');
    expect(screen.getByTitle('Xem trước main.pdf')).toBeTruthy();
  });

  it('dòng tệp theo Figma T1: ngày 12/11, dung lượng có dấu chấm, chip Bản scan chính', () => {
    const big: DocGroup[] = [
      {
        ...groups[0]!,
        files: [{ ...file('f1', 'main.pdf'), size_bytes: 2_976_000 }],
      },
    ];
    render(<DmsDocumentsTab {...base} groups={big} canDeleteScan={false} />);
    expect(screen.getByText('2.906 KB · v1 · 12/11')).toBeTruthy();
    expect(screen.getAllByText('Bản scan chính').length).toBeGreaterThan(0);
  });

  it('tên tệp rất dài (không khoảng trắng) bị cắt bằng dấu ba chấm, có tooltip, không kéo giãn cột', () => {
    const long = `t_${'a'.repeat(40)}_dms_${'b'.repeat(80)}.pdf`;
    const g: DocGroup[] = [{ ...groups[1]!, files: [file('f9', long)] }];
    const { container } = render(<DmsDocumentsTab {...base} groups={g} canDeleteScan={false} />);
    const link = screen.getByRole('link', { name: long });
    expect(link.getAttribute('title')).toBe(long);
    expect(link.className).toContain('truncate');
    // jsdom không dàn trang: kiểm các lớp giữ cột trái không giãn quá ô lưới (min-w-0 + cột minmax(0,1fr)).
    const column = container.querySelector('section')!.parentElement!;
    expect(column.className).toContain('min-w-0');
    expect(column.className).toContain('grid-cols-[minmax(0,1fr)]');
    expect(container.querySelector('section')!.className).toContain('min-w-0');
    expect(screen.getByLabelText('Xem trước tệp').className).toContain('min-w-0');
  });

  it('chọn tệp khác thì khung xem trước đổi theo', () => {
    render(<DmsDocumentsTab {...base} groups={groups} previewId="f3" canDeleteScan={false} />);
    expect(screen.getByTitle('Xem trước bien-ban.pdf').getAttribute('src')).toContain('/f3/');
  });

  it('trạng thái rỗng có đúng một nút Tải lên', () => {
    render(<DmsDocumentsTab {...base} groups={[]} canDeleteScan={false} />);
    expect(screen.getByText('Chưa có tài liệu nào')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Tải lên$/ })).toHaveLength(1);
  });

  it('không có quyền tải lên thì ẩn nút Tải lên', () => {
    render(
      <DmsDocumentsTab
        {...base}
        canUpload={false}
        canAddScan={false}
        groups={groups}
        canDeleteScan={false}
      />,
    );
    expect(screen.queryByRole('button', { name: /^Tải lên$/ })).toBeNull();
  });
});

describe('Hộp thoại Tải lên', () => {
  it('mặc định gắn vào "Tài liệu khác", tải từng tệp và làm mới', async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      calls.push(String(url));
      const body = String(url).includes('/other-document')
        ? { label: 'doc-9' }
        : { code: 'FILE_ATTACHED' };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    });
    const onOpenChange = vi.fn();
    render(
      <UploadDialog
        caseId="c1"
        targets={[{ id: 'd1', label: 'Vi bằng' }]}
        allowOther
        open
        onOpenChange={onOpenChange}
      />,
    );
    const input = screen.getByLabelText('Chọn tệp') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tải lên 1 tệp' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(calls[0]).toBe('/api/dms/cases/c1/other-document');
    expect(calls[1]).toMatch(/documents\/doc-9\/files\?label=a\.pdf&isScan=true/);
    expect(refresh).toHaveBeenCalled();
  });

  it('chọn tài liệu có sẵn và bỏ tick bản scan', async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      calls.push(String(url));
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    render(
      <UploadDialog
        caseId="c1"
        targets={[{ id: 'd1', label: 'Vi bằng' }]}
        allowOther
        open
        onOpenChange={() => undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText('Gắn vào tài liệu'), { target: { value: 'd1' } });
    fireEvent.click(screen.getByLabelText(/Đây là bản scan/));
    fireEvent.change(screen.getByLabelText('Chọn tệp'), {
      target: { files: [new File(['x'], 'b.jpg', { type: 'image/jpeg' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tải lên 1 tệp' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatch(/documents\/d1\/files\?label=b\.jpg&isScan=false/);
  });

  it('đổi tên tệp ngay trong hộp thoại thì gửi tên mới', async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      calls.push(String(url));
      const body = String(url).includes('/other-document') ? { label: 'doc-9' } : {};
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    });
    render(
      <UploadDialog caseId="c1" targets={[]} allowOther open onOpenChange={() => undefined} />,
    );
    // Chỉ có "Tài liệu khác" thì không cần ô chọn "Gắn vào tài liệu".
    expect(screen.queryByLabelText('Gắn vào tài liệu')).toBeNull();
    fireEvent.change(screen.getByLabelText('Chọn tệp'), {
      target: { files: [new File(['x'], 'scan-001.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.change(screen.getByLabelText('Tên tài liệu cho scan-001.pdf'), {
      target: { value: 'Biên bản xác minh' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tải lên 1 tệp' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(new URL(calls[1]!, 'http://x').searchParams.get('label')).toBe('Biên bản xác minh');
  });

  it('chưa chọn tệp thì báo lỗi', () => {
    render(
      <UploadDialog caseId="c1" targets={[]} allowOther open onOpenChange={() => undefined} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tải lên' }));
    expect(screen.getByRole('alert').textContent).toContain('ít nhất một tệp');
  });
});
