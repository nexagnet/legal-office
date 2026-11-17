import { describe, expect, it } from 'vitest';
import { MAX_AVATAR_BYTES, receiveAvatar } from './avatar';

const stream = (...parts: Buffer[]) => ({
  async *[Symbol.asyncIterator]() {
    for (const p of parts) yield p;
  },
});
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(20),
]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WEBP'),
  Buffer.alloc(10),
]);

describe('receiveAvatar', () => {
  it('accepts jpeg, png and webp with a matching signature', async () => {
    expect((await receiveAvatar(stream(JPG), 'image/jpeg', undefined)).extension).toBe('jpg');
    expect((await receiveAvatar(stream(PNG), 'image/png', undefined)).extension).toBe('png');
    expect((await receiveAvatar(stream(WEBP), 'image/webp; x=1', undefined)).extension).toBe(
      'webp',
    );
  });
  it('rejects other types, gif, pdf and a signature that does not match the declared type', async () => {
    await expect(receiveAvatar(stream(PNG), 'image/gif', undefined)).rejects.toMatchObject({
      status: 422,
    });
    await expect(receiveAvatar(stream(PNG), 'application/pdf', undefined)).rejects.toMatchObject({
      status: 422,
    });
    await expect(receiveAvatar(stream(PNG), 'image/jpeg', undefined)).rejects.toMatchObject({
      status: 422,
    });
    await expect(
      receiveAvatar(stream(Buffer.alloc(0)), 'image/png', undefined),
    ).rejects.toMatchObject({ status: 422 });
  });
  it('rejects over 2 MB, by header and by actual bytes', async () => {
    await expect(
      receiveAvatar(stream(PNG), 'image/png', String(MAX_AVATAR_BYTES + 1)),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      receiveAvatar(stream(PNG, Buffer.alloc(MAX_AVATAR_BYTES)), 'image/png', '10'),
    ).rejects.toMatchObject({ status: 413 });
  });
});
