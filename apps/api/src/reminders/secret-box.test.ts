import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, keyFromEnv } from './secret-box';
import { isInternalHost } from './smtp-host';

const key = Buffer.alloc(32, 7);

describe('secret-box', () => {
  it('mã hoá rồi giải mã đúng, bản mã không chứa bản rõ và mỗi lần khác nhau', () => {
    const a = encryptSecret('mat-khau-gia-lap', key, 'tenant-1');
    expect(a).not.toContain('mat-khau');
    expect(decryptSecret(a, key, 'tenant-1')).toBe('mat-khau-gia-lap');
    expect(encryptSecret('mat-khau-gia-lap', key, 'tenant-1')).not.toBe(a);
  });

  it('sai tenant, sai khoá hoặc bản mã bị sửa thì không giải được', () => {
    const a = encryptSecret('x', key, 'tenant-1');
    expect(() => decryptSecret(a, key, 'tenant-2')).toThrow();
    expect(() => decryptSecret(a, Buffer.alloc(32, 8), 'tenant-1')).toThrow();
    const parts = a.split('.');
    parts[3] = Buffer.from('zzzz').toString('base64url');
    expect(() => decryptSecret(parts.join('.'), key, 'tenant-1')).toThrow();
    expect(() => decryptSecret('rác', key, 'tenant-1')).toThrow();
  });

  it('khoá môi trường phải đúng 32 byte base64', () => {
    expect(keyFromEnv(undefined)).toBeNull();
    expect(keyFromEnv('')).toBeNull();
    expect(keyFromEnv(Buffer.alloc(16).toString('base64'))).toBeNull();
    expect(keyFromEnv(key.toString('base64'))?.equals(key)).toBe(true);
  });
});

describe('isInternalHost', () => {
  it('chặn đích nội bộ hiển nhiên, cho qua máy chủ công cộng', () => {
    for (const h of [
      'localhost',
      'mail.localhost',
      '127.0.0.1',
      '10.0.0.5',
      '172.16.3.4',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '::1',
      'fd00::1',
      'db.internal',
    ])
      expect(isInternalHost(h), h).toBe(true);
    for (const h of ['smtp.gmail.com', 'smtp.office365.com', '8.8.8.8', '172.32.0.1'])
      expect(isInternalHost(h), h).toBe(false);
  });
});
