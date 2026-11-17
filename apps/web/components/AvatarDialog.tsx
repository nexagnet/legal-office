'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { AVATAR_ACCEPT, AVATAR_MAX_INPUT_BYTES, squareAvatarBlob } from '../lib/avatar-image';
import { invalidateAvatar } from '../lib/avatar-versions';
import { messageFor } from '../lib/messages';
import { Avatar } from './ui/avatar';
import { Button } from './ui/button';
import { Modal } from './ui/dialog';

/** Người dùng TỰ đổi hoặc gỡ ảnh đại diện của mình (Admin không đổi hộ; máy chủ chỉ nhận theo phiên đăng nhập). */
export function AvatarDialog({
  open,
  onOpenChange,
  name,
  userId,
  avatarVersion,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly name: string;
  readonly userId: string | null;
  readonly avatarVersion: number | null;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function done(res: Response, okText: string) {
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      const message =
        json.code === 'FILE_TOO_LARGE'
          ? 'Ảnh quá lớn (tối đa 2 MB).'
          : json.code === 'INVALID_DOCUMENT'
            ? 'Chỉ nhận ảnh JPG, PNG hoặc WebP.'
            : messageFor(json.code);
      setError(message);
      return;
    }
    toast.success(okText);
    if (userId) invalidateAvatar(userId);
    router.refresh();
    onOpenChange(false);
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!/^image\/(jpeg|png|webp)$/.test(file.type))
      return setError('Chỉ nhận ảnh JPG, PNG hoặc WebP.');
    if (file.size > AVATAR_MAX_INPUT_BYTES) return setError('Ảnh quá lớn (tối đa 10 MB).');
    setBusy(true);
    try {
      let blob: Blob;
      try {
        blob = await squareAvatarBlob(file);
      } catch {
        return setError('Không đọc được ảnh này. Hãy chọn ảnh khác.');
      }
      const res = await fetch('/api/people/me/avatar', {
        method: 'PUT',
        headers: { 'content-type': blob.type },
        body: blob,
      });
      await done(res, 'Đã cập nhật ảnh đại diện');
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await done(await fetch('/api/people/me/avatar', { method: 'DELETE' }), 'Đã gỡ ảnh đại diện');
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Ảnh đại diện"
      description="Ảnh JPG, PNG hoặc WebP; hệ thống tự cắt vuông và thu nhỏ. Chỉ bạn đổi được ảnh của mình."
    >
      <div className="grid justify-items-center gap-4">
        <Avatar
          name={name}
          id={userId}
          photoVersion={avatarVersion}
          className="!size-24 !text-3xl"
        />
        <input
          ref={input}
          type="file"
          accept={AVATAR_ACCEPT}
          className="sr-only"
          aria-label="Chọn ảnh đại diện"
          data-testid="avatar-file"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" loading={busy} onClick={() => input.current?.click()}>
            {avatarVersion ? 'Đổi ảnh' : 'Tải ảnh lên'}
          </Button>
          {avatarVersion ? (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void remove()}>
              Gỡ ảnh
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
