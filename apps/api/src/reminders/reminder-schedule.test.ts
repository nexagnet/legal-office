import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { runRemindersOnce } from './reminder-schedule';

const log = () => ({ info: vi.fn(), error: vi.fn() });

function fakePool(lockGranted: boolean) {
  const queries: string[] = [];
  const release = vi.fn();
  const client = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      return { rows: [{ ok: lockGranted }] };
    }),
    release,
  };
  return { pool: { connect: async () => client } as unknown as pg.Pool, queries, release };
}

describe('runRemindersOnce', () => {
  it('không có tenant nào thì không chạy và báo lỗi cấu hình', async () => {
    const { pool, queries } = fakePool(true);
    const l = log();
    await expect(runRemindersOnce(pool, {}, l)).resolves.toBe(false);
    expect(queries).toEqual([]);
    expect(l.error).toHaveBeenCalledOnce();
  });

  it('bản khác đang giữ khoá thì bỏ qua, không nhả khoá không phải của mình', async () => {
    const { pool, queries, release } = fakePool(false);
    const l = log();
    await expect(runRemindersOnce(pool, { REMINDER_TENANT_IDS: 'a' }, l)).resolves.toBe(false);
    expect(queries).toHaveLength(1);
    expect(release).toHaveBeenCalledOnce();
  });

  it('giành được khoá thì chạy từng tenant rồi nhả khoá', async () => {
    const { pool, queries, release } = fakePool(true);
    const l = log();
    // DB giả không có cấu hình SMTP hợp lệ nên từng tenant lỗi; lỗi tenant không được chặn lượt hay làm kẹt khoá.
    await expect(runRemindersOnce(pool, { REMINDER_TENANT_IDS: 'a,b' }, l)).resolves.toBe(true);
    expect(queries[0]).toContain('pg_try_advisory_lock');
    expect(queries.at(-1)).toContain('pg_advisory_unlock');
    expect(l.error).toHaveBeenCalled();
    expect(release).toHaveBeenCalled();
  });
});
