/**
 * In một tệp PDF bằng hộp thoại in của trình duyệt: nạp PDF vào iframe ẩn rồi gọi print().
 * PDF lấy qua blob cùng origin nên không vướng Content-Disposition: attachment của API.
 */

const PRINT_FRAME_LIFETIME_MS = 5 * 60_000;
const PRINT_DELAY_MS = 150;

/** Tải PDF về dạng Blob; ném lỗi nếu API trả mã lỗi. */
export async function fetchPdfBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`pdf-${res.status}`);
  const body = await res.blob();
  return new Blob([body], { type: 'application/pdf' });
}

/** Mở hộp thoại in cho PDF; nếu trình duyệt không cho in trong iframe thì mở PDF ở tab mới. */
export function printPdfBlob(blob: Blob): void {
  const objectUrl = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText =
    'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
  const cleanup = () => {
    frame.remove();
    URL.revokeObjectURL(objectUrl);
  };
  frame.addEventListener('load', () => {
    setTimeout(() => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        window.open(objectUrl, '_blank', 'noopener');
      }
    }, PRINT_DELAY_MS);
  });
  frame.src = objectUrl;
  document.body.append(frame);
  setTimeout(cleanup, PRINT_FRAME_LIFETIME_MS);
}
