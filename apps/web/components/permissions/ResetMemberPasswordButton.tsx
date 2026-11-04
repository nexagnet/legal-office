'use client';

import { useRef, useState, type FormEvent } from 'react';
import { messageFor } from '../../lib/messages';

/**
 * Admin đặt lại mật khẩu cho một tài khoản (khi người dùng không tự đặt lại được qua email). Mật khẩu do Admin đặt chỉ dùng
 * để đăng nhập một lần: người dùng bị buộc đổi ngay, mọi phiên cũ của họ bị thu hồi.
 */
export function ResetMemberPasswordButton({
  userId,
  email,
}: {
  readonly userId: string;
  readonly email: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get('password') ?? '');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/users/${userId}/password`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) return setDone(true);
      const body = (await res.json().catch(() => ({}))) as {
        code?: string;
        label?: string | null;
      };
      setError(body.code === 'WEAK_PASSWORD' && body.label ? body.label : messageFor(body.code));
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setDone(false);
          dialog.current?.showModal();
        }}
      >
        Đặt lại mật khẩu
      </button>
      <dialog ref={dialog} className="branch-dialog" aria-labelledby={`pw-reset-${userId}`}>
        <form className="form" onSubmit={submit}>
          <h2 id={`pw-reset-${userId}`}>Đặt lại mật khẩu</h2>
          <p className="muted">
            Người dùng sẽ bị đăng xuất khỏi mọi thiết bị và phải đổi mật khẩu ngay ở lần đăng nhập
            tiếp theo. Gửi mật khẩu tạm cho họ qua kênh an toàn.
          </p>
          {done ? (
            <p role="status">Đã đặt lại mật khẩu.</p>
          ) : (
            <label>
              Mật khẩu tạm (tối thiểu 12 ký tự)
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={200}
                autoComplete="new-password"
              />
            </label>
          )}
          <p role="alert" className="error" hidden={!error}>
            {error}
          </p>
          <div className="admin-toolbar">
            <button type="button" onClick={() => dialog.current?.close()}>
              {done ? 'Đóng' : 'Hủy'}
            </button>
            {done ? null : (
              <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
                Đặt lại mật khẩu
              </button>
            )}
          </div>
        </form>
      </dialog>
    </>
  );
}
