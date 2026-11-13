import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AttrInput } from '../components/AttrInput';

afterEach(cleanup);

describe('gợi ý giá trị cho cột sổ cần lọc theo nghiệp vụ', () => {
  it('Hình thức tống đạt có danh sách gợi ý nhưng vẫn gõ tự do được', () => {
    const { container } = render(
      <AttrInput name="hinh_thuc_tong_dat" defaultValue="Giao tận tay" />,
    );
    const input = container.querySelector('input')!;
    expect(input.getAttribute('list')).toBe('sg-hinh_thuc_tong_dat');
    expect(input.value).toBe('Giao tận tay'); // giá trị cũ giữ nguyên
    const opts = [...container.querySelectorAll('datalist option')].map((o) =>
      o.getAttribute('value'),
    );
    expect(opts).toContain('Niêm yết');
  });

  it('cột khác không có danh sách gợi ý; cột đánh dấu gợi ý gõ x', () => {
    const { container } = render(<AttrInput name="ghi_chu" />);
    expect(container.querySelector('datalist')).toBeNull();
    cleanup();
    const t = render(<AttrInput name="co_quan_toa_an" tick />);
    expect(t.container.querySelector('input')!.getAttribute('placeholder')).toBe('Gõ x nếu có');
  });
});
