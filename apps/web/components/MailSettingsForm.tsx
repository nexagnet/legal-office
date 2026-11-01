'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';
import { NoteBox, Pill } from './permissions/Pill';
import { Button } from './ui/button';
import { Field, Input } from './ui/field';

export interface MailSettings {
  readonly keyReady: boolean;
  readonly configured: boolean;
  readonly host: string | null;
  readonly port: number | null;
  readonly secure: boolean | null;
  readonly username: string | null;
  readonly hasPassword: boolean;
  readonly mailFrom: string | null;
  readonly updatedAt: string | null;
  readonly testTo: string | null;
  /** Công tắc đăng nhập bằng link email của cả tenant (mặc định bật). */
  readonly loginLinkEnabled?: boolean;
}

const NETWORK_ERROR = 'Không kết nối được máy chủ. Vui lòng thử lại.';

/** Cấu hình SMTP để gửi email nhắc hạn. Chỉ Admin. Mật khẩu chỉ gửi đi khi nhập mới; máy chủ không bao giờ trả lại mật khẩu. */
export function MailSettingsForm({
  officeId,
  settings,
}: {
  readonly officeId: string;
  readonly settings: MailSettings;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loginLink, setLoginLink] = useState(settings.loginLinkEnabled ?? true);

  async function call(url: string, method: 'PUT' | 'POST', body: unknown) {
    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { code?: string; label?: string | null };
    return { ok: res.ok, json };
  }

  async function run(action: () => Promise<{ error?: string; notice?: string }>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await action();
      if (r.error) setError(r.error);
      if (r.notice) setNotice(r.notice);
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  }

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const password = String(f.get('password') ?? '');
    const username = String(f.get('username') ?? '').trim();
    return run(async () => {
      const { ok, json } = await call('/api/office/mail-settings', 'PUT', {
        officeId,
        host: String(f.get('host') ?? '').trim(),
        port: Number(f.get('port')),
        secure: f.get('secure') === 'on',
        username: username === '' ? null : username,
        ...(password !== '' ? { password } : {}),
        ...(password === '' && f.get('clearPassword') === 'on' ? { clearPassword: true } : {}),
        mailFrom: String(f.get('mailFrom') ?? '').trim(),
      });
      if (!ok) return { error: messageFor(json.code) };
      form.reset();
      router.refresh();
      return { notice: 'Đã lưu cấu hình email.' };
    });
  }

  const toggleLoginLink = (enabled: boolean) =>
    run(async () => {
      const { ok, json } = await call('/api/office/mail-settings/login-link', 'PUT', {
        officeId,
        enabled,
      });
      if (!ok) return { error: messageFor(json.code) };
      setLoginLink(enabled);
      return {
        notice: enabled
          ? 'Đã bật đăng nhập bằng link email.'
          : 'Đã tắt đăng nhập bằng link email: người dùng chỉ đăng nhập bằng mật khẩu.',
      };
    });

  const sendTest = () =>
    run(async () => {
      const { ok, json } = await call('/api/office/mail-settings/test', 'POST', { officeId });
      if (!ok) return { error: messageFor(json.code) };
      return { notice: `Đã gửi thư thử tới ${json.label ?? 'email đăng nhập của bạn'}.` };
    });

  return (
    <section className="grid gap-4" aria-labelledby="mail-t">
      {!settings.keyReady ? (
        <div className="state" role="alert">
          <h3>Chưa bật được lưu mật khẩu</h3>
          <p>
            Máy chủ chưa có khoá mã hoá <code>MAIL_SETTINGS_KEY</code>. Nhờ người quản trị hạ tầng
            đặt biến này trước khi lưu mật khẩu SMTP.
          </p>
        </div>
      ) : null}
      <form
        className="grid gap-5 rounded-2xl bg-surface p-6 shadow-sm"
        onSubmit={save}
        aria-label="Cấu hình máy chủ gửi thư"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="mail-t" className="font-serif text-lg">
            Máy chủ gửi thư (SMTP)
          </h2>
          <Pill tone={settings.configured ? 'ok' : 'brass'}>
            {settings.configured ? 'Đã cấu hình' : 'Chưa cấu hình'}
          </Pill>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <Field id="mail-host" label="Máy chủ">
            <Input
              id="mail-host"
              name="host"
              required
              maxLength={253}
              defaultValue={settings.host ?? ''}
              placeholder="smtp.example.com"
              autoComplete="off"
            />
          </Field>
          <Field id="mail-port" label="Cổng">
            <Input
              id="mail-port"
              name="port"
              type="number"
              required
              min={1}
              max={65535}
              defaultValue={settings.port ?? 465}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input name="secure" type="checkbox" defaultChecked={settings.secure ?? true} />
          Kết nối mã hoá ngay từ đầu (TLS/SSL, thường là cổng 465; bỏ chọn nếu dùng cổng 587)
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="mail-user" label="Tài khoản">
            <Input
              id="mail-user"
              name="username"
              maxLength={254}
              defaultValue={settings.username ?? ''}
              autoComplete="off"
            />
          </Field>
          <Field id="mail-pass" label="Mật khẩu SMTP">
            <Input
              id="mail-pass"
              name="password"
              type="password"
              maxLength={500}
              autoComplete="new-password"
              placeholder={settings.hasPassword ? 'Đã lưu, để trống để giữ nguyên' : ''}
            />
          </Field>
        </div>
        {settings.hasPassword ? (
          <label className="flex items-center gap-2 text-sm">
            <input name="clearPassword" type="checkbox" />
            Xoá mật khẩu đã lưu (chỉ có tác dụng khi ô mật khẩu để trống)
          </label>
        ) : null}
        <Field id="mail-from" label="Địa chỉ người gửi">
          <Input
            id="mail-from"
            name="mailFrom"
            required
            maxLength={300}
            defaultValue={settings.mailFrom ?? ''}
            placeholder="Văn phòng <no-reply@example.com>"
          />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              role="switch"
              name="loginLink"
              checked={loginLink}
              disabled={busy}
              onChange={(e) => toggleLoginLink(e.currentTarget.checked)}
              className="mt-1"
            />
            <span className="grid gap-0.5">
              <strong>Cho phép đăng nhập bằng link email</strong>
              <span className="text-xs text-muted">
                Áp dụng cho mọi người dùng. Link dùng một lần, hết hạn sau 15 phút. Chỉ có hiệu lực
                khi đã cấu hình máy chủ gửi thư.
              </span>
            </span>
          </label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !settings.configured}
              onClick={sendTest}
            >
              Gửi thư thử{settings.testTo ? ` tới ${settings.testTo}` : ''}
            </Button>
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? 'Đang xử lý…' : 'Lưu cấu hình'}
            </Button>
          </div>
        </div>
        {error ? <p role="alert">{error}</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
      </form>
      <NoteBox title="Mật khẩu SMTP được mã hoá">
        Sau khi lưu không hiển thị lại. Để trống ô mật khẩu khi sửa nghĩa là giữ nguyên mật khẩu cũ.
      </NoteBox>
    </section>
  );
}
