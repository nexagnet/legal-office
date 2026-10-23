'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';

export function LoginForm({ tenantId }: { readonly tenantId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'password' | 'email' | 'code'>('password');

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
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      if (res.ok) {
        router.push('/');
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

  async function submitEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId, email: String(form.get('email') ?? '').trim() }),
      });
      if (res.ok) {
        setStep('code');
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      setError(messageFor(res.status === 429 && !body.code ? 'ACCOUNT_LOCKED' : body.code));
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: String(form.get('code') ?? '').trim() }),
      });
      if (res.ok) {
        router.push('/');
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      setError(messageFor(body.code));
      if (body.code && body.code !== 'INVALID_CODE' && body.code !== 'CODE_NOT_ISSUED') {
        setStep('email');
      }
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  if (step === 'code') {
    return (
      <form className="card form" onSubmit={submitCode} aria-labelledby="login-title">
        <h1 id="login-title">Xác thực đăng nhập</h1>
        <p>
          Nếu email đúng là tài khoản quản trị, bạn sẽ nhận thư trong ít phút. Bấm link trong thư để
          nhận mã 6 số, rồi nhập mã vào đây (giữ nguyên trình duyệt này).
        </p>
        <label>
          Mã xác thực
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
          />
        </label>
        <p role="alert" className="error" hidden={!error}>
          {error}
        </p>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Đang xác thực…' : 'Xác nhận'}
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setStep('email');
          }}
        >
          Quay lại
        </button>
      </form>
    );
  }

  if (step === 'email') {
    return (
      <form className="card form" onSubmit={submitEmail} aria-labelledby="login-title">
        <h1 id="login-title">Đăng nhập quản trị bằng email</h1>
        <p>Nhập email quản trị, chúng tôi sẽ gửi link đăng nhập (không cần mật khẩu).</p>
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required maxLength={254} />
        </label>
        <p role="alert" className="error" hidden={!error}>
          {error}
        </p>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Đang gửi…' : 'Gửi link qua email'}
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setStep('password');
          }}
        >
          Đăng nhập bằng mật khẩu
        </button>
      </form>
    );
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
      <button
        type="button"
        onClick={() => {
          setError(null);
          setStep('email');
        }}
      >
        Admin: đăng nhập bằng email
      </button>
    </form>
  );
}
