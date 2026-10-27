import { describe, expect, it } from 'vitest';
import { caseMenu } from './vi-bang/[id]/case-menu';

const base = '/vi-bang/c1';
const progress = {
  misaStatus: 'CONFIRMED_FULL',
  misaRevokeStatus: 'NONE',
  numberLabel: 'VB-0001',
  signedAt: '2026-10-25T03:00:00Z',
  stampedAt: null,
  hasFinalScan: false,
};
const caseOf = (status: string) => ({
  id: 'c1',
  title: 'VB-1',
  description: null,
  status,
  createdAt: '2026-10-20T03:00:00Z',
  responsibleThvUserId: 'u1',
});
const find = (groups: ReturnType<typeof caseMenu>, key: string) =>
  groups.flatMap((g) => g.items).find((i) => i.key === key);

describe('caseMenu', () => {
  it('lets the signed, unstamped case proceed to sign/stamp but not to returning the result', () => {
    const g = caseMenu({
      c: caseOf('SIGNED'),
      base,
      progress,
      isAdmin: true,
      isFinal: false,
      windowOpen: false,
      pendingChanges: 0,
    });
    expect(find(g, 'ky-dong-dau')?.disabled).toBe(false);
    expect(find(g, 'tra-ket-qua')).toMatchObject({ disabled: true, hint: 'Chưa đủ điều kiện' });
    expect(find(g, 'cap-so')).toMatchObject({ disabled: true, hint: 'Đã cấp số' });
    expect(find(g, 'duyet-sua')).toBeUndefined();
    expect(find(g, 'huy-ho-so')?.tone).toBe('danger');
  });

  it('shows approval and cancellation only to Admin, and approval only with pending requests', () => {
    const args = {
      c: caseOf('SIGNED'),
      base,
      progress,
      isFinal: false,
      windowOpen: false,
      pendingChanges: 2,
    };
    const admin = caseMenu({ ...args, isAdmin: true });
    const other = caseMenu({ ...args, isAdmin: false });
    expect(find(admin, 'duyet-sua')?.label).toBe('Duyệt đề nghị sửa (2)');
    expect(find(other, 'duyet-sua')).toBeUndefined();
    expect(find(other, 'phan-cong')).toBeUndefined();
    expect(find(other, 'huy-ho-so')).toBeUndefined();
  });

  it('only allows issuing a copy once the result is returned', () => {
    const returned = caseMenu({
      c: caseOf('RETURNED'),
      base,
      progress,
      isAdmin: false,
      isFinal: true,
      windowOpen: false,
      pendingChanges: 0,
    });
    expect(find(returned, 'cap-ban-sao')?.disabled).toBe(false);
    expect(find(returned, 'ky-dong-dau')).toBeUndefined();
  });
});
