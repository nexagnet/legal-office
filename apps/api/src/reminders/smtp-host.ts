import { isIP } from 'node:net';

/**
 * Máy chủ SMTP do Admin nhập; API sẽ kết nối tới đó khi gửi thử, nên chặn đích nội bộ hiển nhiên (localhost, IP literal
 * loopback/riêng tư/link-local/metadata). Không thay được lọc ở tầng mạng: tên miền trỏ về IP nội bộ vẫn qua được.
 */
export function isInternalHost(host: string): boolean {
  const h = host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  if (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.internal') ||
    h.endsWith('.local')
  )
    return true;
  const kind = isIP(h);
  if (kind === 4) {
    const [a, b] = h.split('.').map(Number) as [number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (kind === 6) {
    return (
      h === '::1' ||
      h === '::' ||
      /^f[cd]/.test(h) ||
      h.startsWith('fe80') ||
      h.startsWith('::ffff:')
    );
  }
  return false;
}
