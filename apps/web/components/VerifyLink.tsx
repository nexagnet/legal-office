'use client';

import { useState } from 'react';
import { messageFor } from '../lib/messages';

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'shown'; readonly code: string; readonly minutes: number }
  | { readonly kind: 'error'; readonly message: string };

/** Mã chỉ sinh khi bấm nút (không tự gọi khi mở trang) để trình quét email không làm hỏng link dùng một lần. */
export function VerifyLink({
  tenantId,
  token,
}: {
  readonly tenantId: string;
  readonly token: string;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function reveal() {
    setState({ kind: 'busy' });
    try {
      const res = await fetch('/api/auth/verify-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId, token }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        code?: string;
        verificationCode?: string;
        validMinutes?: number;
      };
      if (res.ok && body.verificationCode) {
        setState({ kind: 'shown', code: body.verificationCode, minutes: body.validMinutes ?? 10 });
        return;
      }
      setState({ kind: 'error', message: messageFor(body.code) });
    } catch {
      setState({ kind: 'error', message: 'Không kết nối được máy chủ. Vui lòng thử lại.' });
    }
  }

  return (
    <section className="card form" aria-labelledby="verify-title">
      <h1 id="verify-title">Xác thực đăng nhập</h1>
      {state.kind === 'shown' ? (
        <>
          <p>Nhập mã này vào màn đăng nhập ở trình duyệt bạn đang đăng nhập:</p>
          <p className="verify-code" aria-live="polite">
            {state.code}
          </p>
          <p>Mã có hiệu lực {state.minutes} phút và chỉ hiện một lần. Đừng chia sẻ mã này.</p>
        </>
      ) : (
        <>
          <p>Bấm nút để nhận mã xác thực. Link chỉ dùng được một lần.</p>
          <p role="alert" className="error" hidden={state.kind !== 'error'}>
            {state.kind === 'error' ? state.message : null}
          </p>
          <button
            type="button"
            className="primary"
            disabled={state.kind === 'busy'}
            onClick={reveal}
          >
            {state.kind === 'busy' ? 'Đang lấy mã…' : 'Hiện mã xác thực'}
          </button>
        </>
      )}
    </section>
  );
}
