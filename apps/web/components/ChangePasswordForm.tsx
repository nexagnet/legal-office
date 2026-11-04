'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';

/**
 * Đổi mật khẩu của chính mình (cần mật khẩu hiện tại). `forced`: tài khoản mới tạo hoặc Admin vừa đặt lại mật khẩu, phải đổi
 * xong mới dùng tiếp hệ thống.
 */
export function ChangePasswordForm({ forced }: { readonly forced: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const newPassword = String(f.get('newPassword') ?? '');
    if (newPassword !== String(f.get('confirm') ?? ''))
      return setError('Hai mật khẩu mới chưa giống nhau.');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currentPassword: String(f.get('currentPassword') ?? ''),
          newPassword,
        }),
      });
      if (res.ok) {
        router.push('/');
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        code?: string;
        label?: string | null;
      };
      setError(
        body.code === 'WEAK_PASSWORD' && body.label
          ? body.label
          : messageFor(body.code ?? 'WRONG_PASSWORD'),
      );
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit} aria-labelledby="change-title">
      <h1 id="change-title">Đổi mật khẩu</h1>
      {forced ? (
        <p role="status">
          Mật khẩu hiện tại do quản trị viên đặt. Hãy đặt mật khẩu của riêng bạn trước khi tiếp tục.
        </p>
      ) : null}
      <label>
        Mật khẩu hiện tại
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          maxLength={200}
        />
      </label>
      <label>
        Mật khẩu mới (tối thiểu 12 ký tự)
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={200}
        />
      </label>
      <label>
        Nhập lại mật khẩu mới
        <input
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={200}
        />
      </label>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
      <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
        {busy ? 'Đang lưu…' : 'Đổi mật khẩu'}
      </button>
    </form>
  );
}
