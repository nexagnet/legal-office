'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';

/**
 * Đăng nhập bằng email HOẶC số CCCD + mật khẩu. Quên mật khẩu thì nhận link đặt lại qua email. Tài khoản mới tạo hoặc vừa được
 * Admin đặt lại mật khẩu phải đổi mật khẩu ngay sau lần đăng nhập đầu.
 */
export function LoginForm({ tenantId }: { readonly tenantId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          // Trường API vẫn tên `email`; giá trị có thể là email hoặc số CCCD.
          email: String(form.get('identifier') ?? '').trim(),
          password: String(form.get('password') ?? ''),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        code?: string;
        mustChangePassword?: boolean;
      };
      if (res.ok) {
        router.push(body.mustChangePassword ? '/doi-mat-khau' : '/');
        router.refresh();
        return;
      }
      setError(messageFor(res.status === 429 && !body.code ? 'ACCOUNT_LOCKED' : body.code));
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit} aria-labelledby="login-title">
      <h1 id="login-title">Đăng nhập</h1>
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
      <label>
        Mật khẩu
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={200}
        />
      </label>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
      <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
        {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </button>
      <p className="muted">
        <Link href="/quen-mat-khau">Quên mật khẩu?</Link>
      </p>
    </form>
  );
}
