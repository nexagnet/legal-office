import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';

/** Khoá 32 byte, base64, ở biến môi trường `MAIL_SETTINGS_KEY` (tạo: `openssl rand -base64 32`). Sai độ dài thì coi như thiếu. */
export function keyFromEnv(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  return key.length === 32 ? key : null;
}

/** AES-256-GCM; `aad` (mã tenant) buộc bản mã chỉ giải được đúng tenant. Dạng lưu: `v1.<iv>.<tag>.<ct>` (base64url). */
export function encryptSecret(plain: string, key: Buffer, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ct]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

export function decryptSecret(stored: string, key: Buffer, aad: string): string {
  const [version, iv, tag, ct] = stored.split('.');
  if (version !== VERSION || !iv || !tag || !ct) throw new Error('Bản mã không hợp lệ');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString(
    'utf8',
  );
}
