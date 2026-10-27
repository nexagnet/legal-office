import { describe, expect, it } from 'vitest';
import { groupApprovals, groupMyWork } from '../lib/overview';
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
