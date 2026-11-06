'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';
import { Button } from './ui/button';
import { Textarea } from './ui/field';
import { Modal } from './ui/dialog';

/**
 * Nút "Xóa scan" và hộp thoại xác nhận (N6). Chỉ FILE SCAN mới xóa được: hồ sơ, STT, dòng sổ và bản trình không bao giờ bị xóa.
 * Xóa là xóa mềm: file vào mục "Scan đã xóa 30 ngày" (chỉ Admin xem và tải, không khôi phục), hết 30 ngày mới bị dọn khỏi kho.
 * Bắt buộc lý do. Quyền do máy chủ quyết định; nút chỉ hiện với người có quyền `dms.scan.delete`.
 */
export function DeleteScanButton({
  kind,
  fileId,
  label,
}: {
  readonly kind: 'document' | 'submission';
  readonly fileId: string;
  /** Tên file, để người xóa biết đang xóa file nào. */
  readonly label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const reason = String(new FormData(e.currentTarget).get('reason') ?? '').trim();
    if (!reason) return setError('Cần nhập lý do xóa.');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/dms/scans/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, fileId, reason }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setError(messageFor(json.code));
      setOpen(false);
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        Xóa scan
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Xóa file scan?"
        description={`Bạn sắp xóa file "${label}".`}
      >
        <form onSubmit={submit} className="grid gap-3" aria-label="Xóa file scan">
          <ul className="m-0 grid gap-1 pl-5 text-sm text-muted">
            <li>Chỉ file scan này bị xóa; hồ sơ, STT và dòng sổ vẫn còn nguyên.</li>
            <li>File chuyển vào mục "Scan đã xóa 30 ngày", chỉ Admin xem và tải được.</li>
            <li>Không khôi phục được. Sau 30 ngày file bị xóa hẳn khỏi kho.</li>
          </ul>
          <label className="grid gap-1 text-[13px] font-semibold">
            Lý do xóa
            <Textarea name="reason" required maxLength={1000} rows={3} />
          </label>
          {error ? <p role="alert">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" variant="danger" loading={busy}>
              Xóa scan
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
