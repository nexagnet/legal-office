'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';

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

  const sendTest = () =>
    run(async () => {
      const { ok, json } = await call('/api/office/mail-settings/test', 'POST', { officeId });
      if (!ok) return { error: messageFor(json.code) };
      return { notice: `Đã gửi thư thử tới ${json.label ?? 'email đăng nhập của bạn'}.` };
    });

  return (
    <section className="mail-settings" aria-labelledby="mail-t">
      <h2 id="mail-t">Email nhắc hạn</h2>
      <p className="muted">
        Máy chủ SMTP dùng để gửi thư nhắc hạn tự động tới email đăng nhập của từng người. Mật khẩu
        được mã hoá khi lưu và không bao giờ hiển thị lại; để trống ô mật khẩu là giữ mật khẩu cũ.
      </p>
      {!settings.keyReady ? (
        <div className="state" role="alert">
          <h3>Chưa bật được lưu mật khẩu</h3>
          <p>
            Máy chủ chưa có khoá mã hoá <code>MAIL_SETTINGS_KEY</code>. Nhờ người quản trị hạ tầng
            đặt biến này trước khi lưu mật khẩu SMTP.
          </p>
        </div>
      ) : null}
      <form className="card form" onSubmit={save}>
        <label>
          Máy chủ SMTP
          <input
            name="host"
            required
            maxLength={253}
            defaultValue={settings.host ?? ''}
            placeholder="smtp.example.com"
            autoComplete="off"
          />
        </label>
        <label>
          Cổng
          <input
            name="port"
            type="number"
            required
            min={1}
            max={65535}
            defaultValue={settings.port ?? 465}
          />
        </label>
        <label className="check">
          <input name="secure" type="checkbox" defaultChecked={settings.secure ?? true} />
          Kết nối mã hoá ngay từ đầu (TLS/SSL, thường là cổng 465; bỏ chọn nếu dùng cổng 587)
        </label>
        <label>
          Tên đăng nhập SMTP
          <input
            name="username"
            maxLength={254}
            defaultValue={settings.username ?? ''}
            autoComplete="off"
          />
        </label>
        <label>
          Mật khẩu SMTP
          <input
            name="password"
            type="password"
            maxLength={500}
            autoComplete="new-password"
            placeholder={settings.hasPassword ? 'Đã lưu, để trống để giữ nguyên' : ''}
          />
        </label>
        {settings.hasPassword ? (
          <label className="check">
            <input name="clearPassword" type="checkbox" />
            Xoá mật khẩu đã lưu (chỉ có tác dụng khi ô mật khẩu để trống)
          </label>
        ) : null}
        <label>
          Địa chỉ gửi (From)
          <input
            name="mailFrom"
            required
            maxLength={300}
            defaultValue={settings.mailFrom ?? ''}
            placeholder="Legal Office <no-reply@example.com>"
          />
        </label>
        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Đang xử lý…' : 'Lưu cấu hình'}
          </button>
          <button type="button" disabled={busy || !settings.configured} onClick={sendTest}>
            Gửi thư thử{settings.testTo ? ` tới ${settings.testTo}` : ''}
          </button>
        </div>
        {error ? <p role="alert">{error}</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
      </form>
    </section>
  );
}
