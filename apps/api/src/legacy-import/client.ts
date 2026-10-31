import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

export interface FileMeta {
  readonly relPath: string;
  readonly size: number;
  readonly sha256: string;
  readonly mime: string;
  readonly mtime?: string;
}

export type PrepareResult =
  | { status: 'REGISTERED'; deduplicated: true; fileId: string | null; code: string }
  | {
      status: 'UPLOAD';
      deduplicated: false;
      url: string;
      headers: Record<string, string>;
      expiresAt: string;
    };

export interface ClientOptions {
  readonly baseUrl: string;
  /** Ví dụ { cookie: 'session=...' }. Không ghi ra nhật ký. */
  readonly headers: Readonly<Record<string, string>>;
  readonly fetchImpl?: typeof fetch;
  readonly maxRetries?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Lỗi mạng và 5xx/429 thì thử lại với thời gian chờ tăng dần; 4xx là lỗi thật, báo ngay. */
export class ImportApi {
  private readonly f: typeof fetch;
  private readonly retries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  constructor(private readonly opts: ClientOptions) {
    this.f = opts.fetchImpl ?? fetch;
    this.retries = opts.maxRetries ?? 5;
    this.sleep = opts.sleep ?? wait;
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (e) {
        const retryable = !(e instanceof ApiError) || e.status >= 500 || e.status === 429;
        if (!retryable || attempt >= this.retries) throw e;
        await this.sleep(Math.min(30_000, 1000 * 2 ** attempt));
      }
    }
  }

  private async json<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    return this.withRetry(async () => {
      const res = await this.f(`${this.opts.baseUrl}${path}`, {
        method,
        headers: {
          ...this.opts.headers,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      if (!res.ok) throw new ApiError(res.status, String(data.code ?? 'HTTP_ERROR'));
      return data as T;
    });
  }

  openBatch(officeId: string, label: string, sourceRoot?: string) {
    return this.json<{ code: string; label: string }>('POST', '/dms/legacy/batches', {
      officeId,
      label,
      ...(sourceRoot ? { sourceRoot } : {}),
    });
  }
  report(batchId: string) {
    return this.json<{
      status: string;
      fileCount: number;
      totalBytes: number;
      uniqueObjects: number;
    }>('GET', `/dms/legacy/batches/${batchId}`);
  }
  close(batchId: string) {
    return this.json('POST', `/dms/legacy/batches/${batchId}/close`);
  }
  prepare(batchId: string, meta: FileMeta) {
    return this.json<PrepareResult>('POST', `/dms/legacy/batches/${batchId}/files/prepare`, meta);
  }
  complete(batchId: string, meta: FileMeta) {
    return this.json<{ fileId: string | null; code: string }>(
      'POST',
      `/dms/legacy/batches/${batchId}/files/complete`,
      meta,
    );
  }

  /** PUT thẳng lên kho bằng liên kết đã ký. Mỗi lần thử mở lại luồng đọc tệp từ đầu. */
  async upload(
    absPath: string,
    size: number,
    target: { url: string; headers: Record<string, string> },
  ): Promise<void> {
    await this.withRetry(async () => {
      // Node (undici) cần duplex: 'half' khi gửi luồng.
      const init: RequestInit & { duplex: 'half' } = {
        method: 'PUT',
        headers: { ...target.headers, 'content-length': String(size) },
        body:
          size === 0
            ? new Uint8Array()
            : (Readable.toWeb(createReadStream(absPath)) as unknown as ReadableStream),
        duplex: 'half',
      };
      const res = await this.f(target.url, init);
      if (!res.ok) throw new ApiError(res.status, 'UPLOAD_FAILED');
    });
  }
}
