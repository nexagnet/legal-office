import { describe, expect, it } from 'vitest';
import type { PgService } from '../db/pg.service';
import { VibangRepo } from './vibang.repo';

const pg = {
  withTenant: (
    _tenant: string,
    fn: (c: { query: () => Promise<{ rows: unknown[] }> }) => unknown,
  ) => fn({ query: () => Promise.resolve({ rows: [] }) }),
} as unknown as PgService;

describe('VibangRepo.rows', () => {
  const repo = new VibangRepo(pg);

  it.each(['vb_list_contract_attachments', 'vb_list_contract_parties', 'vb_list_contract_addenda'])(
    'cho phép hàm đọc %s',
    async (fn) => {
      await expect(repo.rows('t', fn, [])).resolves.toEqual([]);
    },
  );

  it('từ chối tên hàm lạ', () => {
    expect(() => repo.rows('t', 'vb_list_contract_secrets', [])).toThrow('unsafe function name');
  });
});
