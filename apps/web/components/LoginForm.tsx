'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';

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
          email: String(form.get('email') ?? ''),
          password: String(form.get('password') ?? ''),
        }),
      });
      if (res.ok) {
        router.push('/');
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      setError(messageFor(res.status === 429 ? 'ACCOUNT_LOCKED' : body.code));
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
        Email
        <input name="email" type="email" autoComplete="username" required maxLength={254} />
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
      <button type="submit" className="primary" disabled={busy}>
        {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </button>
    </form>
  );
}
