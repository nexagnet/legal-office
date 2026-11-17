/** Ảnh đại diện gửi lên là hình vuông tối đa 256×256, nén jpeg: nhẹ và đúng giới hạn 2 MB của máy chủ. */
export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp';
export const AVATAR_MAX_INPUT_BYTES = 10 * 1024 * 1024;
const OUT = 256;

/** Cắt giữa thành hình vuông rồi thu về 256×256 (jpeg). Ném lỗi nếu trình duyệt không đọc được ảnh. */
export async function squareAvatarBlob(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, OUT, OUT);
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      OUT,
      OUT,
    );
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) throw new Error('encode');
    return blob;
  } finally {
    bitmap.close();
  }
}
