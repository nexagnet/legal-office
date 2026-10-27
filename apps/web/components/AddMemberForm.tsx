'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ROLE_LABEL, messageFor } from '../lib/messages';
import type { Branch } from '../app/session';

const STEPS: readonly [string, string][] = [
  ['Tạo tài khoản', 'Ngay khi bấm gửi. Người mới chưa có vai nên chưa vào được hệ thống.'],
  ['Trưởng văn phòng duyệt', 'Hiện ở mục Phân quyền. Người duyệt phải khác người đề xuất.'],
  ['Người mới đăng nhập', 'Có vai, quyền ký và địa điểm như đề xuất. Mọi bước được ghi nhật ký.'],
];

/**
 * Admin thêm thành viên mới. Tài khoản được tạo ngay nhưng CHƯA có vai: hệ thống lập đề xuất và chỉ khi Trưởng văn phòng
 * (khác người) duyệt thì người đó mới vào được hệ thống.
 */
export function AddMemberForm({
  officeId,
  branches,
}: {
  readonly officeId: string;
  readonly branches: readonly Branch[];
}) {
  const router = useRouter();
  const [role, setRole] = useState('THU_KY');
  const [login, setLogin] = useState<'link' | 'password'>('link');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const canSign = role === 'ADMIN' || role === 'TRUONG_VP';
  const canBranch = role === 'VAN_THU' || role === 'KE_TOAN';

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch('/api/admin/members', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          officeId,
          email: String(f.get('email') ?? '').trim(),
          fullName: String(f.get('fullName') ?? '').trim(),
          role,
          legalSigner: canSign && f.get('legalSigner') === 'on',
          branchId: canBranch && f.get('branchId') ? String(f.get('branchId')) : null,
          temporaryPassword:
            login === 'password' ? String(f.get('temporaryPassword') ?? '') || null : null,
          reason: String(f.get('reason') ?? '').trim(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setError(messageFor(json.code));
      form.reset();
      setRole('THU_KY');
      setLogin('link');
      setDone(true);
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panels assign-grid" onSubmit={submit} aria-labelledby="member-t">
      <section className="panel form">
        <h2 id="member-t">Thông tin thành viên</h2>
        <label>
          Họ và tên
          <input name="fullName" required maxLength={200} autoComplete="off" />
        </label>
        <label>
          Email đăng nhập
          <input name="email" type="email" required maxLength={254} autoComplete="off" />
        </label>
        <fieldset className="seg" aria-label="Vai trò">
          <legend>Vai trò</legend>
          {Object.entries(ROLE_LABEL).map(([k, v]) => (
            <label key={k}>
              <input
                type="radio"
                name="role"
                value={k}
                checked={role === k}
                onChange={() => setRole(k)}
              />
              {v}
            </label>
          ))}
        </fieldset>
        {canBranch ? (
          <label>
            Địa điểm được cấp
            <select name="branchId" defaultValue="">
              <option value="">Chưa cấp</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {canSign ? (
          <label>
            <input name="legalSigner" type="checkbox" /> Cấp quyền ký pháp lý
          </label>
        ) : (
          <p className="muted">Quyền ký pháp lý chỉ áp dụng cho Admin và Trưởng văn phòng.</p>
        )}
        <fieldset className="seg" aria-label="Cách đăng nhập">
          <legend>Cách đăng nhập</legend>
          <label>
            <input
              type="radio"
              name="login"
              checked={login === 'link'}
              onChange={() => setLogin('link')}
            />
            Gửi link đăng nhập qua email (khuyến nghị)
          </label>
          <label>
            <input
              type="radio"
              name="login"
              checked={login === 'password'}
              onChange={() => setLogin('password')}
            />
            Đặt mật khẩu tạm
          </label>
        </fieldset>
        {login === 'password' ? (
          <>
            <label>
              Mật khẩu tạm (tối thiểu 12 ký tự)
              <input
                name="temporaryPassword"
                type="password"
                required
                minLength={12}
                maxLength={200}
                autoComplete="new-password"
              />
            </label>
            <p className="muted">
              Admin biết mật khẩu này nên có thể đăng nhập thay người đó. Chỉ dùng khi chưa cấu hình
              email gửi thư.
            </p>
          </>
        ) : (
          <p className="muted">
            Người dùng bấm link trong email để vào, không ai biết mật khẩu của họ. Cần cấu hình{' '}
            <Link href="/quan-tri/email">email gửi thư</Link>.
          </p>
        )}
        <label>
          Lý do
          <input name="reason" required maxLength={1000} />
        </label>
        <p role="alert" className="error" hidden={!error}>
          {error}
        </p>
        <p role="status" className="success" hidden={!done}>
          Đã tạo tài khoản và gửi đề xuất, chờ Trưởng văn phòng duyệt.{' '}
          <Link href="/quan-tri/phan-quyen">Xem đề xuất</Link>
        </p>
        <div className="admin-toolbar">
          <Link href="/quan-tri/nhan-su">Hủy</Link>
          <button type="submit" className="primary" disabled={busy}>
            Thêm và gửi đề xuất
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>Điều gì xảy ra sau khi gửi</h2>
        <ol>
          {STEPS.map(([a, b]) => (
            <li key={a}>
              <strong>{a}</strong>
              <p className="muted">{b}</p>
            </li>
          ))}
        </ol>
        <p className="muted">
          Quy tắc hai người: Admin đề xuất, Trưởng văn phòng duyệt. Không có đường đi tắt.
        </p>
      </section>
    </form>
  );
}
