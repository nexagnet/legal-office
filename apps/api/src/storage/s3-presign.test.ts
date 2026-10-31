import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { S3FileStore, isDirectTransferStore, LocalFileStore } from './file-store';
import { legacyObjectKey } from '../dms/legacy';

// Cấp liên kết ký sẵn không cần mạng: chỉ kiểm cấu trúc chữ ký, KHÔNG thay cho thử với R2 thật.
const store = new S3FileStore({
  bucket: 'b',
  endpoint: 'https://acc.r2.cloudflarestorage.com',
  region: 'auto',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'secret',
});

describe('liên kết tải lên ký sẵn (S3/R2)', () => {
  const sha = createHash('sha256').update('noi dung').digest('hex');
  const key = legacyObjectKey('t1', 'o1', sha);

  it('ký content-length, content-type và checksum sha256; checksum nằm ở header, không ở query', async () => {
    const up = await store.presignPut(key, {
      sha256Hex: sha,
      size: 8,
      mime: 'application/pdf',
      ttlSeconds: 600,
    });
    const u = new URL(up.url);
    const signed = u.searchParams.get('X-Amz-SignedHeaders') ?? '';
    for (const h of ['content-length', 'content-type', 'x-amz-checksum-sha256'])
      expect(signed).toContain(h);
    expect(u.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(u.searchParams.has('x-amz-checksum-sha256')).toBe(false);
    expect(up.headers['x-amz-checksum-sha256']).toBe(Buffer.from(sha, 'hex').toString('base64'));
    expect(decodeURIComponent(u.pathname)).toContain(key);
  });

  it('liên kết tải về có tên tệp an toàn và hạn ngắn', async () => {
    const url = new URL(
      await store.presignGet(key, {
        ttlSeconds: 300,
        fileName: 'Biên bản "1".pdf',
        mime: 'application/pdf',
      }),
    );
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('response-content-disposition')).toContain(
      'filename="Bi_n_b_n__1_.pdf"',
    );
  });

  it('chỉ kho S3 hỗ trợ tải thẳng; kho đĩa thì không', () => {
    expect(isDirectTransferStore(store)).toBe(true);
    expect(isDirectTransferStore(new LocalFileStore('/tmp/x'))).toBe(false);
    expect(isDirectTransferStore(null)).toBe(false);
  });

  it('khoá đối tượng gồm tenant, văn phòng và hash', () => {
    expect(key).toBe(`t/t1/legacy/o1/${sha.slice(0, 2)}/${sha}`);
  });
});
