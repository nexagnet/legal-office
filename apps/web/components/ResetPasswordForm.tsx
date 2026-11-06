'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';

/** Đặt mật khẩu mới bằng mã trong email (dùng một lần). Đặt xong thì thu hồi mọi phiên cũ, người dùng đăng nhập lại. */
export function ResetPasswordForm({
  tenantId,
  token,
}: {
  readonly tenantId: string;
  readonly token: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get('password') ?? '');
    if (password !== String(f.get('confirm') ?? ''))
      return setError('Hai mật khẩu chưa giống nhau.');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId, token, password }),
      });
      if (res.ok) return setDone(true);
      const body = (await res.json().catch(() => ({}))) as {
        code?: string;
        label?: string | null;
      };
      setError(
        body.code === 'WEAK_PASSWORD' && body.label
          ? body.label
          : messageFor(body.code ?? 'RESET_INVALID'),
      );
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="card form" aria-labelledby="reset-title">
        <h1 id="reset-title">Đã đặt mật khẩu mới</h1>
        <p role="status">Bạn có thể đăng nhập bằng mật khẩu mới.</p>
        <Link className="primary btn-link" href="/login">
          Đăng nhập
        </Link>
      </section>
    );
  }

  return (
    <form className="card form" onSubmit={submit} aria-labelledby="reset-title">
      <h1 id="reset-title">Đặt mật khẩu mới</h1>
      <label>
        Mật khẩu mới (tối thiểu 12 ký tự)
        <input
          name="password"
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
        {busy ? 'Đang lưu…' : 'Lưu mật khẩu mới'}
      </button>
    </form>
  );
}
