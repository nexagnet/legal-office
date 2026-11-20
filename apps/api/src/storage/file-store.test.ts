import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { readdirSync } from 'node:fs';
import {
  fileStoreFromEnv,
  isStreamTransferStore,
  LocalFileStore,
  S3FileStore,
  StreamStoreError,
} from './file-store';

describe('LocalFileStore', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lo-store-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const store = new LocalFileStore(dir);

  it('round-trips bytes and returns null for a missing key', async () => {
    await store.put('t/a/b.pdf', Buffer.from('abc'));
    expect(await store.get('t/a/b.pdf')).toEqual(Buffer.from('abc'));
    await store.delete('t/a/b.pdf');
    expect(await store.get('t/a/b.pdf')).toBeNull();
  });

  it.each(['../x', '/abs', 'a/../../x', '', ' '])('refuses unsafe key %j', async (key) => {
    await expect(store.put(key, Buffer.from('x'))).rejects.toThrow('unsafe');
    await expect(store.get(key)).rejects.toThrow('unsafe');
  });
});

describe('LocalFileStore streaming', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lo-stream-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const store = new LocalFileStore(dir);
  const data = Buffer.from('noi dung tai lieu cu');
  const sha = createHash('sha256').update(data).digest('hex');
  const code = (p: Promise<unknown>) =>
    p.then(
      () => 'ok',
      (e: unknown) => (e instanceof StreamStoreError ? e.code : String(e)),
    );

  it('is recognised as a stream store', () => {
    expect(isStreamTransferStore(store)).toBe(true);
  });

  it('stores a matching stream, reports head and streams it back', async () => {
    const key = 't/a/legacy/o/ab/' + sha;
    await store.putStream(key, Readable.from([data]), { sha256Hex: sha, size: data.length });
    expect(await store.head(key)).toEqual({ size: data.length });
    const got = await store.getStream(key);
    const chunks: Buffer[] = [];
    for await (const c of got!.stream) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks)).toEqual(data);
    expect(got!.size).toBe(data.length);
  });

  it('never overwrites an existing key', async () => {
    const key = 't/a/legacy/o/ab/' + sha;
    expect(
      await code(
        store.putStream(key, Readable.from([data]), { sha256Hex: sha, size: data.length }),
      ),
    ).toBe('EXISTS');
  });

  it('rejects wrong size or wrong hash and leaves nothing behind', async () => {
    const key = 't/b/x';
    expect(
      await code(store.putStream(key, Readable.from([data]), { sha256Hex: sha, size: 3 })),
    ).toBe('SIZE_MISMATCH');
    expect(
      await code(store.putStream(key, Readable.from([data]), { sha256Hex: sha, size: 99 })),
    ).toBe('SIZE_MISMATCH');
    expect(
      await code(
        store.putStream(key, Readable.from([data]), {
          sha256Hex: '0'.repeat(64),
          size: data.length,
        }),
      ),
    ).toBe('HASH_MISMATCH');
    expect(await store.head(key)).toBeNull();
    expect(readdirSync(join(dir, 't/b'))).toEqual([]);
  });

  it('refuses new files when the disk is below the free-space threshold', async () => {
    const full = new LocalFileStore(dir, 0.9999999);
    expect(
      await code(
        full.putStream('t/c/x', Readable.from([data]), { sha256Hex: sha, size: data.length }),
      ),
    ).toBe('DISK_FULL');
  });
});

describe('fileStoreFromEnv', () => {
  it('is null when nothing is configured', () => {
    expect(fileStoreFromEnv({})).toBeNull();
  });

  it('builds a local store and requires its directory', () => {
    expect(fileStoreFromEnv({ FILE_STORE: 'local', FILE_STORE_DIR: tmpdir() })).toBeInstanceOf(
      LocalFileStore,
    );
    expect(() => fileStoreFromEnv({ FILE_STORE: 'local' })).toThrow('FILE_STORE_DIR');
  });

  it('validates the free-space threshold', () => {
    expect(() =>
      fileStoreFromEnv({
        FILE_STORE: 'local',
        FILE_STORE_DIR: tmpdir(),
        FILE_STORE_MIN_FREE_PERCENT: '100',
      }),
    ).toThrow('FILE_STORE_MIN_FREE_PERCENT');
  });

  it('builds R2 only with every setting, naming what is missing', () => {
    expect(() => fileStoreFromEnv({ FILE_STORE: 'r2', R2_BUCKET: 'b' })).toThrow(
      /R2_ACCOUNT_ID.*R2_ACCESS_KEY_ID.*R2_SECRET_ACCESS_KEY/,
    );
    const ok = fileStoreFromEnv({
      FILE_STORE: 'r2',
      R2_ACCOUNT_ID: 'acc',
      R2_BUCKET: 'b',
      R2_ACCESS_KEY_ID: 'k',
      R2_SECRET_ACCESS_KEY: 's',
    });
    expect(ok).toBeInstanceOf(S3FileStore);
  });

  it('rejects an unknown kind', () => {
    expect(() => fileStoreFromEnv({ FILE_STORE: 'ftp' })).toThrow('unknown FILE_STORE');
  });
});
