import { describe, expect, it } from 'vitest';
import { readInput } from './bootstrap-tenant.cli';

const ok = {
  TENANT_NAME: 'Văn phòng Mẫu',
  BRANCHES: 'Chi nhánh A, Chi nhánh B ,',
  ADMIN_EMAIL: ' Admin@Example.invalid ',
  ADMIN_NAME: 'Nguyễn Văn A',
  ADMIN_PASSWORD: 'mat-khau-dai-hon-12-ky-tu',
} as NodeJS.ProcessEnv;

describe('bootstrap-tenant readInput', () => {
  it('chuẩn hóa email, tách chi nhánh, lấy tên văn phòng theo tenant', () => {
    const r = readInput(ok);
    expect(r.adminEmail).toBe('admin@example.invalid');
    expect(r.branches).toEqual(['Chi nhánh A', 'Chi nhánh B']);
    expect(r.officeName).toBe('Văn phòng Mẫu');
    expect(r.adminCccd).toBeUndefined();
  });

  it('từ chối thiếu trường, mật khẩu ngắn, CCCD sai, không có chi nhánh', () => {
    expect(() => readInput({ ...ok, ADMIN_NAME: '' })).toThrow(/Thiếu/);
    expect(() => readInput({ ...ok, ADMIN_PASSWORD: 'ngan' })).toThrow();
    expect(() => readInput({ ...ok, ADMIN_CCCD: '123' })).toThrow(/12 chữ số/);
    expect(() => readInput({ ...ok, BRANCHES: ' , ' })).toThrow(/chi nhánh/);
    expect(readInput({ ...ok, ADMIN_CCCD: '012345678901' }).adminCccd).toBe('012345678901');
  });
});
