import { describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';
import { hashPassword, passwordPolicyError, verifyPassword } from './password';

describe('password hashing', () => {
  it('verifies the right password and rejects wrong, malformed or empty hashes', async () => {
    const h = await hashPassword('mat-khau-gia-lap-1');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('mat-khau-gia-lap-1', h)).toBe(true);
    expect(await verifyPassword('mat-khau-gia-lap-2', h)).toBe(false);
    expect(await verifyPassword('x', 'plain-text')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$1$1$1$$')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$99999999$8$1$YWJj$YWJj')).toBe(false);
  });
  it('salts every hash', async () => {
    expect(await hashPassword('mat-khau-gia-lap-1')).not.toBe(
      await hashPassword('mat-khau-gia-lap-1'),
    );
  });
  it('enforces length policy', () => {
    expect(passwordPolicyError('ngan')).toMatch(/tối thiểu/);
    expect(passwordPolicyError('x'.repeat(201))).toMatch(/quá dài/);
    expect(passwordPolicyError('x'.repeat(12))).toBeNull();
  });
});

describe('session cookie parsing', () => {
  const T = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
  it('accepts tenant.token and rejects malformed values', () => {
    const token = 'A'.repeat(43);
    expect(AuthService.parseCookieValue(`${T}.${token}`)).toEqual({ tenantId: T, token });
    expect(AuthService.parseCookieValue(undefined)).toBeNull();
    expect(AuthService.parseCookieValue('abc')).toBeNull();
    expect(AuthService.parseCookieValue(`${T}.short`)).toBeNull();
    expect(AuthService.parseCookieValue(`not-a-uuid.${token}`)).toBeNull();
  });
});
