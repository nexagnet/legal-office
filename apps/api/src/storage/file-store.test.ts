import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { fileStoreFromEnv, LocalFileStore, S3FileStore } from './file-store';

describe('LocalFileStore', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lo-store-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const store = new LocalFileStore(dir);

  it('round-trips bytes and returns null for a missing key', async () => {
    await store.put('t/a/b.pdf', Buffer.from('abc'), 'application/pdf');
    expect(await store.get('t/a/b.pdf')).toEqual(Buffer.from('abc'));
    await store.delete('t/a/b.pdf');
    expect(await store.get('t/a/b.pdf')).toBeNull();
  });

  it.each(['../x', '/abs', 'a/../../x', '', ' '])('refuses unsafe key %j', async (key) => {
    await expect(store.put(key, Buffer.from('x'), 'application/pdf')).rejects.toThrow('unsafe');
    await expect(store.get(key)).rejects.toThrow('unsafe');
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
