import { describe, expect, it } from 'vitest';
import { groupApprovals, groupMisaQueue, groupMyWork } from '../lib/overview';
import type { CaseItem } from '../lib/cases';
import type { MyWorkItem } from '../lib/my-work-view';

const now = new Date('2026-10-27T03:00:00Z');
const mk = (refId: string, deadlineAt: string | null, overdue = false): MyWorkItem => ({
  domain: 'VIBANG',
  refId,
  label: `VB-${refId}`,
  status: 'ASSIGNED',
  deadlineAt,
  overdue,
});

describe('groupMyWork', () => {
  it('buckets by urgency and keeps one row per item', () => {
    const g = groupMyWork(
      [
        mk('a', '2026-10-26T10:00:00Z', true),
        mk('b', '2026-10-27T10:00:00Z'),
        mk('c', '2026-10-30T10:00:00Z'),
        mk('d', null),
        mk('e', '2026-12-30T10:00:00Z'),
      ],
      now,
    );
    expect(g.map((x) => [x.title, x.rows.map((r) => r.key)])).toEqual([
      ['Quá hạn (1)', ['VIBANG-a']],
      ['Hôm nay (1)', ['VIBANG-b']],
      ['Tuần này (1)', ['VIBANG-c']],
      ['Đang xử lý (2)', ['VIBANG-d', 'VIBANG-e']],
    ]);
    expect(g[0]!.rows[0]!.href).toBe('/vi-bang/a');
  });
  it('returns nothing for an empty list', () => {
    expect(groupMyWork([], now)).toEqual([]);
  });
});

describe('groupApprovals', () => {
  it('puts requests older than a day first', () => {
    const g = groupApprovals(
      [
        { kind: 'TRANSFER', subjectId: 's1', createdAt: '2026-10-27T01:00:00Z' },
        { kind: 'DELEGATION', subjectId: 's2', createdAt: '2026-10-25T01:00:00Z' },
      ],
      now,
    );
    expect(g.map((x) => x.title)).toEqual(['Quá 1 ngày (1)', 'Hôm nay (1)']);
    expect(g[0]!.rows[0]!.meta).toBe('Gửi 2 ngày trước');
  });
});

describe('groupMisaQueue', () => {
  const c = (id: string, createdAt: string, nextStep: string): CaseItem => ({
    id,
    title: `Hồ sơ ${id}`,
    status: 'ASSIGNED',
    createdAt,
    responsibleThvUserId: null,
    branchName: 'Hai Bà Trưng',
    nextStep,
  });
  it('chỉ lấy hồ sơ chờ cấp số, cũ nhất lên trước, liên kết sang hồ sơ', () => {
    const g = groupMisaQueue(
      [
        c('new', '2026-10-27T01:00:00Z', 'MISA_NUMBER'),
        c('old', '2026-10-24T01:00:00Z', 'MISA_NUMBER'),
        c('sign', '2026-10-20T01:00:00Z', 'SIGN'),
      ],
      now,
    );
    expect(g.map((x) => [x.title, x.rows.map((r) => r.key)])).toEqual([
      ['Quá 1 ngày (1)', ['MISA-old']],
      ['Hôm nay (1)', ['MISA-new']],
    ]);
    expect(g[0]?.rows[0]?.href).toBe('/vi-bang/old');
    expect(g[0]?.rows[0]?.meta).toBe('Hai Bà Trưng · Tiếp nhận 3 ngày trước');
  });
  it('trả rỗng khi không có hồ sơ chờ', () => {
    expect(groupMisaQueue([c('x', '2026-10-20T01:00:00Z', 'DONE')], now)).toEqual([]);
  });
});
