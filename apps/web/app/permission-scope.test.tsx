import { describe, expect, it } from 'vitest';
import { defaultScopeLabel, scopeSummary, type DmsGroup } from '../lib/permission-model';

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

describe('scopeSummary', () => {
  it('một phạm vi thì ghi thẳng, nhiều phạm vi thì kèm số hành động', () => {
    expect(scopeSummary([{ scope: 'own' }, { scope: 'own' }])).toBe('Hồ sơ do tôi tạo');
    expect(scopeSummary([{ scope: 'all' }])).toBe('Mọi hồ sơ của văn phòng');
    expect(scopeSummary([{ scope: 'all' }, { scope: 'own' }, { scope: 'own' }])).toBe(
      'Mọi hồ sơ của văn phòng (1 hành động) · Hồ sơ do tôi tạo (2 hành động)',
    );
  });
});
