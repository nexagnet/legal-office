import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { link, mkdir, open, readFile, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Cổng lưu tệp: nghiệp vụ chỉ biết khoá đối tượng, không biết tệp nằm ở đâu (đĩa, R2, S3...). */
export interface FileStore {
  put(key: string, bytes: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

export const FILE_STORE = Symbol('FILE_STORE');

/** Lỗi nghiệp vụ của kho tải theo luồng (API đổi sang mã HTTP tương ứng). */
export type StreamStoreErrorCode = 'EXISTS' | 'SIZE_MISMATCH' | 'HASH_MISMATCH' | 'DISK_FULL';
export class StreamStoreError extends Error {
  constructor(readonly code: StreamStoreErrorCode) {
    super(code);
  }
}

/**
 * Kho tải lên/xuống QUA API theo luồng (không đọc cả tệp vào RAM), dành cho bản lưu trên ổ đĩa (không có liên kết ký sẵn như R2).
 * `putStream` KHÔNG BAO GIỜ ghi đè khoá đã có (thay cho Bucket Lock): ném EXISTS.
 */
export interface StreamTransferStore extends FileStore {
  head(key: string): Promise<{ size: number } | null>;
  putStream(
    key: string,
    source: Readable,
    opts: { sha256Hex: string; size: number },
  ): Promise<void>;
  getStream(key: string): Promise<{ stream: Readable; size: number } | null>;
}

export function isStreamTransferStore(store: FileStore | null): store is StreamTransferStore {
  return (
    store !== null &&
    typeof (store as Partial<StreamTransferStore>).putStream === 'function' &&
    typeof (store as Partial<StreamTransferStore>).getStream === 'function'
  );
}

/** Liên kết tải lên có thời hạn: client gửi PUT thẳng tới kho với đúng các header này. */
export interface PresignedUpload {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresAt: Date;
}

/**
 * Kho cho phép client tải thẳng (không đi qua API): dùng cho tệp lớn/nhập hàng loạt. Kho trên đĩa không hỗ trợ.
 * `sha256Hex` được ký vào yêu cầu để kho TỰ kiểm tra nội dung khi nhận; `size` được ký vào Content-Length.
 */
export interface DirectTransferStore extends FileStore {
  presignPut(
    key: string,
    opts: { sha256Hex: string; size: number; mime: string; ttlSeconds: number },
  ): Promise<PresignedUpload>;
  presignGet(
    key: string,
    opts: { ttlSeconds: number; fileName: string; mime: string },
  ): Promise<string>;
  head(key: string): Promise<{ size: number } | null>;
}

export function isDirectTransferStore(store: FileStore | null): store is DirectTransferStore {
  return (
    store !== null &&
    typeof (store as Partial<DirectTransferStore>).presignPut === 'function' &&
    typeof (store as Partial<DirectTransferStore>).presignGet === 'function' &&
    typeof (store as Partial<DirectTransferStore>).head === 'function'
  );
}

/** Cùng quy tắc với CHECK `object_key` trong DB: không rỗng, không bắt đầu bằng `/`, không chứa `..`. */
function assertSafeKey(key: string): void {
  if (!key.trim() || key.startsWith('/') || key.includes('..') || key.includes('\0'))
    throw new Error('unsafe object key');
}

/** Lưu trên đĩa: dùng cho dev/test, hoặc triển khai nhỏ có ổ đĩa bền. */
export class LocalFileStore implements StreamTransferStore {
  private readonly root: string;
  /** `minFreeFraction`: ổ trống dưới mức này thì từ chối nhận tệp mới (0 = không kiểm). */
  constructor(
    root: string,
    private readonly minFreeFraction = 0,
  ) {
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

  async head(key: string): Promise<{ size: number } | null> {
    try {
      const st = await stat(this.path(key));
      return st.isFile() ? { size: st.size } : null;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async getStream(key: string): Promise<{ stream: Readable; size: number } | null> {
    const h = await this.head(key);
    return h ? { stream: createReadStream(this.path(key)), size: h.size } : null;
  }

  /** Ổ trống dưới ngưỡng thì từ chối (chừa chỗ cho DB, nhật ký, OCR). */
  private async assertFreeSpace(): Promise<void> {
    if (this.minFreeFraction <= 0) return;
    await mkdir(this.root, { recursive: true });
    const fs = await statfs(this.root);
    if (fs.blocks > 0 && fs.bavail / fs.blocks < this.minFreeFraction)
      throw new StreamStoreError('DISK_FULL');
  }

  /**
   * Ghi theo luồng vào tệp tạm, đếm byte và băm sha256 khi nhận; chỉ khi ĐÚNG kích thước và sha256 mới đưa vào khoá thật,
   * bằng `link` (nguyên tử, lỗi nếu khoá đã tồn tại) nên không bao giờ ghi đè tệp cũ.
   */
  async putStream(
    key: string,
    source: Readable,
    opts: { sha256Hex: string; size: number },
  ): Promise<void> {
    const full = this.path(key);
    if (await this.head(key)) throw new StreamStoreError('EXISTS');
    await this.assertFreeSpace();
    await mkdir(dirname(full), { recursive: true });
    const tmp = join(dirname(full), `.${randomBytes(6).toString('hex')}.tmp`);
    const hash = createHash('sha256');
    let received = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        received += chunk.length;
        if (received > opts.size) return cb(new StreamStoreError('SIZE_MISMATCH'));
        hash.update(chunk);
        cb(null, chunk);
      },
    });
    try {
      await pipeline(source, meter, createWriteStream(tmp, { flags: 'wx' }));
      if (received !== opts.size) throw new StreamStoreError('SIZE_MISMATCH');
      if (hash.digest('hex') !== opts.sha256Hex.toLowerCase())
        throw new StreamStoreError('HASH_MISMATCH');
      const fh = await open(tmp, 'r+');
      try {
        await fh.sync();
      } finally {
        await fh.close();
      }
      try {
        await link(tmp, full);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new StreamStoreError('EXISTS');
        throw e;
      }
    } finally {
      await rm(tmp, { force: true });
    }
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
export class S3FileStore implements DirectTransferStore {
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

  async head(key: string): Promise<{ size: number } | null> {
    assertSafeKey(key);
    try {
      const out = await this.client.send(
        new HeadObjectCommand({ Bucket: this.cfg.bucket, Key: key }),
      );
      return { size: out.ContentLength ?? 0 };
    } catch (e) {
      const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }

  async presignPut(
    key: string,
    opts: { sha256Hex: string; size: number; mime: string; ttlSeconds: number },
  ): Promise<PresignedUpload> {
    assertSafeKey(key);
    const checksum = Buffer.from(opts.sha256Hex, 'hex').toString('base64');
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        ContentType: opts.mime,
        ContentLength: opts.size,
        ChecksumSHA256: checksum,
      }),
      {
        expiresIn: opts.ttlSeconds,
        // Giữ checksum ở HEADER (không đẩy lên query) và ký cả content-type, content-length.
        unhoistableHeaders: new Set(['x-amz-checksum-sha256']),
        signableHeaders: new Set(['content-type', 'content-length', 'x-amz-checksum-sha256']),
      },
    );
    return {
      url,
      headers: { 'content-type': opts.mime, 'x-amz-checksum-sha256': checksum },
      expiresAt: new Date(Date.now() + opts.ttlSeconds * 1000),
    };
  }

  presignGet(
    key: string,
    opts: { ttlSeconds: number; fileName: string; mime: string },
  ): Promise<string> {
    assertSafeKey(key);
    const ascii = opts.fileName.replace(/[^A-Za-z0-9._-]/g, '_');
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        ResponseContentType: opts.mime,
        ResponseContentDisposition: `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(opts.fileName)}`,
      }),
      { expiresIn: opts.ttlSeconds },
    );
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
    // FILE_STORE_MIN_FREE_PERCENT: ổ trống dưới mức này (mặc định 10%) thì từ chối tệp mới; 0 = tắt.
    const pct = Number(env.FILE_STORE_MIN_FREE_PERCENT?.trim() || '10');
    if (!Number.isFinite(pct) || pct < 0 || pct >= 100)
      throw new Error('FILE_STORE_MIN_FREE_PERCENT must be in [0, 100)');
    return new LocalFileStore(env.FILE_STORE_DIR, pct / 100);
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
