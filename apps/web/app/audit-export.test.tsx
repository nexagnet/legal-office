import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PermissionLogExport } from '../components/permissions/PermissionLogExport';
import { permissionLabel } from '../lib/permission-model';

afterEach(cleanup);

describe('Xuất bản sao nhật ký phân quyền', () => {
  it('trỏ về endpoint xuất theo văn phòng', () => {
    render(<PermissionLogExport officeId="o 1" />);
    const link = screen.getByRole('link', { name: 'Xuất bản sao' });
    expect(link.getAttribute('href')).toBe('/api/dms/permission-log/export?officeId=o%201');
    expect(link.hasAttribute('download')).toBe(true);
  });

  it('quyền xuất có nhãn tiếng Việt trong danh mục', () => {
    expect(permissionLabel('dms.audit.export')).toBe('Xuất bản sao nhật ký phân quyền');
  });
});
