import { describe, expect, it } from 'vitest';
import { defaultScopeLabel, type DmsGroup } from '../lib/permission-model';

const group = (permissions: string[]) => ({ permissions }) as unknown as DmsGroup;

describe('defaultScopeLabel', () => {
  it('có quyền duyệt thay đổi quyền → toàn văn phòng', () => {
    expect(defaultScopeLabel(group(['dms.permission.approve', 'vibang.read.own']))).toBe(
      'Toàn văn phòng',
    );
  });
  it('chỉ quyền "do tôi tạo" → hồ sơ do tôi tạo', () => {
    expect(defaultScopeLabel(group(['vibang.read.own', 'vibang.draft.own']))).toBe(
      'Hồ sơ do tôi tạo',
    );
  });
  it('còn lại → theo địa điểm', () => {
    expect(defaultScopeLabel(group(['vibang.read.all']))).toBe('Theo địa điểm');
    expect(defaultScopeLabel(group([]))).toBe('Theo địa điểm');
  });
});
