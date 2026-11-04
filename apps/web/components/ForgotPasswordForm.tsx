'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';

/** Quên mật khẩu: nhập email hoặc số CCCD, hệ thống gửi link đặt lại vào email của tài khoản (luôn báo như nhau). */
export function ForgotPasswordForm({ tenantId }: { readonly tenantId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const identifier = String(new FormData(e.currentTarget).get('identifier') ?? '').trim();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId, identifier }),
      });
      if (res.ok) return setSent(true);
      setError('Chưa gửi được yêu cầu. Kiểm tra lại thông tin và thử lại.');
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <section className="card form" aria-labelledby="forgot-title">
        <h1 id="forgot-title">Kiểm tra email của bạn</h1>
        <p role="status">
          Nếu thông tin đúng là một tài khoản, bạn sẽ nhận thư có link đặt lại mật khẩu trong ít
          phút. Link dùng một lần và hết hạn sau 30 phút.
        </p>
        <p className="muted">
          Không nhận được thư? Kiểm tra thư rác, hoặc nhờ Admin đặt lại mật khẩu cho bạn.
        </p>
        <Link href="/login">Quay lại đăng nhập</Link>
      </section>
    );
  }

  return (
    <form className="card form" onSubmit={submit} aria-labelledby="forgot-title">
      <h1 id="forgot-title">Quên mật khẩu</h1>
      <p>
        Nhập email hoặc số CCCD của tài khoản. Chúng tôi sẽ gửi link đặt lại vào email của tài
        khoản.
      </p>
      <label>
        Email hoặc số CCCD
        <input
          name="identifier"
          type="text"
          autoComplete="username"
          required
          minLength={3}
          maxLength={254}
        />
      </label>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
      <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
        {busy ? 'Đang gửi…' : 'Gửi link đặt lại mật khẩu'}
      </button>
      <Link href="/login">Quay lại đăng nhập</Link>
    </form>
  );
}
