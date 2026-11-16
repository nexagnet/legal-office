import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LegacyUploader } from '../components/LegacyUploader';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('tải tài liệu cũ: tên tệp dài', () => {
  it('bảng tiến độ dùng bố cục chống tràn và giữ tên đầy đủ ở title', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );
    const name = `${'rat-dai-'.repeat(30)}.pdf`;
    const { container } = render(<LegacyUploader officeId="o1" ocrOn={false} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], name, { type: 'application/pdf' })] },
    });
    const cell = await waitFor(() => screen.getByRole('rowheader', { name }));
    expect(cell.getAttribute('title')).toBe(name);
    expect(container.querySelector('table.legacy-upload-table')).not.toBeNull();
  });
});
