import { describe, expect, it } from 'vitest';
import { FailClosedResolver, SyntheticHeaderResolver, resolverFromEnv } from './actor';
import { statusFor } from '../vibang/status';

const U = '0b9b1c6e-3a55-4c6a-9d0e-1f2a3b4c5d6e';
const T = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

describe('actor resolution', () => {
  it('authenticates nobody by default', () => {
    expect(new FailClosedResolver().resolve()).toBeNull();
    expect(resolverFromEnv({} as NodeJS.ProcessEnv)).toBeInstanceOf(FailClosedResolver);
  });

  it('accepts synthetic headers only when well-formed', () => {
    const r = new SyntheticHeaderResolver();
    expect(r.resolve({ 'x-synthetic-user': U, 'x-synthetic-tenant': T })).toEqual({
      userId: U,
      tenantId: T,
    });
    expect(r.resolve({ 'x-synthetic-user': U })).toBeNull();
    expect(r.resolve({ 'x-synthetic-user': 'x', 'x-synthetic-tenant': T })).toBeNull();
  });

  it('refuses synthetic mode in production', () => {
    expect(() =>
      resolverFromEnv({ AUTH_MODE: 'synthetic-test', NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    ).toThrow(/forbidden/);
    expect(resolverFromEnv({ AUTH_MODE: 'synthetic-test' } as NodeJS.ProcessEnv)).toBeInstanceOf(
      SyntheticHeaderResolver,
    );
  });
});

describe('statusFor', () => {
  const op = (ok: boolean, code: string) => ({ ok, code, label: null });
  it('maps database outcomes to HTTP statuses', () => {
    expect(statusFor(op(true, 'ALLOWED'))).toBe(200);
    expect(statusFor(op(false, 'BRANCH_NOT_GRANTED'))).toBe(403);
    expect(statusFor(op(false, 'ADMIN_ONLY'))).toBe(403);
    expect(statusFor(op(false, 'CASE_NOT_FOUND'))).toBe(404);
    expect(statusFor(op(false, 'INVALID_DOCUMENT'))).toBe(422);
    expect(statusFor(op(false, 'MISA_NOT_CONFIRMED'))).toBe(409);
    expect(statusFor(op(false, 'SOMETHING_NEW'))).toBe(409);
  });
});
