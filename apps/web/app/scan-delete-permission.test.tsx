// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PermissionTree } from '../components/permissions/PermissionTree';
import {
  SCAN_DELETE_WARNING,
  SPECIAL_PERMISSIONS,
  allPermissionCodes,
  isOverridable,
  isOverrideOnly,
  overridableCodes,
  permissionLabel,
} from '../lib/permission-model';

afterEach(cleanup);

const CODE = 'dms.scan.delete';

describe('quyền xóa file scan (N6, N7): chỉ cấp riêng, không vào nhóm', () => {
  it('có nhãn tiếng Việt', () => {
    expect(SPECIAL_PERMISSIONS[CODE]).toBe('Xóa file scan');
    expect(permissionLabel(CODE)).toBe('Xóa file scan');
  });

  it('cấp riêng được nhưng không nằm trong danh mục mã gán vào nhóm', () => {
    expect(isOverridable(CODE)).toBe(true);
    expect(isOverrideOnly(CODE)).toBe(true);
    expect(overridableCodes()).toContain(CODE);
    // DB không cho nhóm giữ quyền này nên đề xuất thêm quyền vào nhóm không được đề nghị nó.
    expect(allPermissionCodes()).not.toContain(CODE);
    expect(isOverrideOnly('vibang.read.own')).toBe(false);
  });
});

describe('PermissionTree: cảnh báo khi cấp quyền xóa file scan (N7)', () => {
  const noop = () => undefined;

  it('tick cấp mới thì hiện cảnh báo nói rõ hậu quả', () => {
    render(<PermissionTree baseline={new Set()} value={new Set([CODE])} onChange={noop} />);
    const warning = screen.getByTestId('scan-delete-warning');
    expect(warning.textContent).toContain('đang cấp quyền xóa file scan');
    expect(warning.textContent).toContain(SCAN_DELETE_WARNING);
    expect(warning.textContent).toContain('Scan đã xóa 30 ngày');
    expect(warning.textContent).toContain('ghi rõ lý do');
  });

  it('chưa tick thì không có cảnh báo', () => {
    render(<PermissionTree baseline={new Set()} value={new Set()} onChange={noop} />);
    expect(screen.queryByTestId('scan-delete-warning')).toBeNull();
  });

  it('quyền đã có sẵn từ trước (không phải cấp mới) thì không nhắc lại cảnh báo', () => {
    render(<PermissionTree baseline={new Set([CODE])} value={new Set([CODE])} onChange={noop} />);
    expect(screen.queryByTestId('scan-delete-warning')).toBeNull();
  });
});
