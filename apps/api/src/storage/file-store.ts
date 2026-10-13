import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/** Cổng lưu tệp: nghiệp vụ chỉ biết khoá đối tượng, không biết tệp nằm ở đâu (đĩa, R2, S3...). */
export interface FileStore {
  put(key: string, bytes: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

export const FILE_STORE = Symbol('FILE_STORE');

/** Cùng quy tắc với CHECK `object_key` trong DB: không rỗng, không bắt đầu bằng `/`, không chứa `..`. */
function assertSafeKey(key: string): void {
  if (!key.trim() || key.startsWith('/') || key.includes('..') || key.includes('\0'))
    throw new Error('unsafe object key');
}

/** Lưu trên đĩa: dùng cho dev/test, hoặc triển khai nhỏ có ổ đĩa bền. */
export class LocalFileStore implements FileStore {
  private readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }

  private path(key: string): string {
    assertSafeKey(key);
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new Error('unsafe object key');
    return full;
  }

  async put(key: string, bytes: Buffer): Promise<void> {
    const full = this.path(key);
    await mkdir(dirname(full), { recursive: true });
    // Ghi tệp tạm rồi đổi tên để không bao giờ để lại tệp ghi dở dưới khoá thật.
    const tmp = join(dirname(full), `.${randomBytes(6).toString('hex')}.tmp`);
    await writeFile(tmp, bytes);
    await rename(tmp, full);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.path(key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }
}

export interface S3Config {
  readonly bucket: string;
  readonly endpoint?: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

/** Cloudflare R2 (hoặc bất kỳ kho tương thích S3) qua S3 API. */
export class S3FileStore implements FileStore {
  private readonly client: S3Client;
  constructor(private readonly cfg: S3Config) {
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: Boolean(cfg.endpoint),
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }

  async put(key: string, bytes: Buffer, mime: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(
      new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, Body: bytes, ContentType: mime }),
    );
  }

  async get(key: string): Promise<Buffer | null> {
    assertSafeKey(key);
    try {
      const out = await this.client.send(
        new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }),
      );
      return out.Body ? Buffer.from(await out.Body.transformToByteArray()) : null;
    } catch (e) {
      if ((e as { name?: string }).name === 'NoSuchKey') return null;
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
  }
}

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Chọn kho từ biến môi trường. `FILE_STORE=r2` cần R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY (bí mật đặt ở môi trường chạy, không bao giờ vào repo). `FILE_STORE=local` cần FILE_STORE_DIR.
 * Không đặt gì = null: các thao tác cần tệp trả 503 thay vì giả vờ lưu.
 */
export function fileStoreFromEnv(env: Env = process.env): FileStore | null {
  const kind = env.FILE_STORE;
  if (!kind) return null;
  if (kind === 'local') {
    if (!env.FILE_STORE_DIR) throw new Error('FILE_STORE_DIR is required when FILE_STORE=local');
    return new LocalFileStore(env.FILE_STORE_DIR);
  }
  if (kind === 'r2') {
    const need = [
      'R2_ACCOUNT_ID',
      'R2_BUCKET',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
    ] as const;
    const missing = need.filter((k) => !env[k]);
    if (missing.length > 0) throw new Error(`FILE_STORE=r2 is missing: ${missing.join(', ')}`);
    return new S3FileStore({
      bucket: env.R2_BUCKET!,
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      region: 'auto',
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    });
  }
  throw new Error(`unknown FILE_STORE: ${kind}`);
}
