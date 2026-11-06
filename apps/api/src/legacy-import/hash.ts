import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/** sha256 dạng luồng: không nạp cả tệp vào bộ nhớ. */
export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(path)
      .on('data', (c) => h.update(c))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')));
  });
}
