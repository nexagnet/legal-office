import { describe, expect, it } from 'vitest';
import { VibangRepo } from './vibang.repo';

// Danh sách tên hàm được phép gọi qua repo. Test tích hợp gọi thẳng DB nên không bắt được hàm mới quên khai báo ở đây.
const stub = {
  withTenant: async (
    _tenant: string,
    fn: (c: { query: () => Promise<{ rows: unknown[] }> }) => unknown,
  ) => fn({ query: async () => ({ rows: [{ ok: true, code: 'ALLOWED', label: null }] }) }),
};
const repo = new VibangRepo(stub as never);

describe('VibangRepo: tên hàm được phép', () => {
  it('cho phép hàm đọc và hàm ghi số cuối sổ giấy của DMS', async () => {
    await expect(repo.rows('t', 'dms_number_status', [])).resolves.toBeDefined();
    await expect(repo.call('t', 'dms_import_last_number', [])).resolves.toBeDefined();
  });

  it('vẫn chặn tên hàm lạ', async () => {
    expect(() => repo.rows('t', 'dms_number_status; DROP TABLE x', [])).toThrow(
      'unsafe function name',
    );
    expect(() => repo.rows('t', 'pg_sleep', [])).toThrow('unsafe function name');
  });
});
