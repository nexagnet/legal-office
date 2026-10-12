import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 32;
const OPTIONS: ScryptOptions = { N, r: R, p: P, maxmem: 64 * 1024 * 1024 };

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;

function derive(password: string, salt: Buffer, options: ScryptOptions, keylen: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, keylen, options, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** Băm scrypt, định dạng `scrypt$N$r$p$salt$hash` (base64url). Không bao giờ lưu mật khẩu gốc. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, OPTIONS, KEYLEN);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [n, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (![n, r, p].every(Number.isInteger) || n > 2 ** 20 || r > 16 || p > 4) return false;
  const salt = Buffer.from(parts[4]!, 'base64url');
  const expected = Buffer.from(parts[5]!, 'base64url');
  if (expected.length === 0) return false;
  const actual = await derive(
    password,
    salt,
    { N: n, r, p, maxmem: 128 * 1024 * 1024 },
    expected.length,
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Băm giả để thời gian trả lời không lộ email có tồn tại hay không. */
let dummy: Promise<string> | undefined;
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(16).toString('hex'));
  return dummy;
}

export function passwordPolicyError(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH)
    return `Mật khẩu tối thiểu ${MIN_PASSWORD_LENGTH} ký tự`;
  if (password.length > MAX_PASSWORD_LENGTH) return 'Mật khẩu quá dài';
  return null;
}
