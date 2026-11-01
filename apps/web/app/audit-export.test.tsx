import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AuditTab } from '../components/permissions/AuditTab';
import { permissionLabel } from '../lib/permission-model';

afterEach(cleanup);

const names = { userName: (id: string | null) => id ?? '—' } as never;

describe('AuditTab — Xuất bản sao nhật ký phân quyền', () => {
  it('chỉ hiện nút khi có quyền xuất, trỏ về endpoint xuất theo văn phòng', () => {
    render(<AuditTab requests={[]} names={names} searchParams={{}} officeId="o 1" canExport />);
    const link = screen.getByRole('link', { name: 'Xuất bản sao' });
    expect(link.getAttribute('href')).toBe('/api/dms/permission-log/export?officeId=o%201');
    expect(link.hasAttribute('download')).toBe(true);
  });

  it('ẩn nút khi không có quyền xuất', () => {
    render(<AuditTab requests={[]} names={names} searchParams={{}} officeId="o1" />);
    expect(screen.queryByRole('link', { name: 'Xuất bản sao' })).toBeNull();
  });

  it('quyền xuất có nhãn tiếng Việt trong danh mục', () => {
    expect(permissionLabel('dms.audit.export')).toBe('Xuất bản sao nhật ký phân quyền');
  });
});
