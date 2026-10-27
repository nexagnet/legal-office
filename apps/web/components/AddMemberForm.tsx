'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ROLE_LABEL, messageFor } from '../lib/messages';
import type { Branch } from '../app/session';

const ROLE_ORDER = ['VAN_THU', 'KE_TOAN', 'THU_KY', 'THV', 'TRUONG_VP', 'ADMIN'].filter(
  (k) => k in ROLE_LABEL,
);

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
  const [role, setRole] = useState('VAN_THU');
  const [branchId, setBranchId] = useState('');
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
          branchId: canBranch && branchId ? branchId : null,
          temporaryPassword:
            login === 'password' ? String(f.get('temporaryPassword') ?? '') || null : null,
          reason: String(f.get('reason') ?? '').trim(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setError(messageFor(json.code));
      form.reset();
      setRole('VAN_THU');
      setBranchId('');
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
    <form className="member-form" onSubmit={submit} aria-labelledby="member-t">
      <section className="mf-main">
        <h2 id="member-t" className="sr-only">
          Thông tin thành viên
        </h2>
        <div className="mf-row">
          <label>
            Họ và tên
            <input name="fullName" required maxLength={200} autoComplete="off" />
          </label>
          <label>
            Email đăng nhập
            <input name="email" type="email" required maxLength={254} autoComplete="off" />
          </label>
        </div>
        <fieldset className="chip-field" aria-label="Vai trò">
          <legend>Vai trò</legend>
          <div className="chip-row">
            {ROLE_ORDER.map((k) => (
              <label key={k} className="chip-radio">
                <input
                  type="radio"
                  name="role"
                  value={k}
                  checked={role === k}
                  onChange={() => setRole(k)}
                />
                <span>{ROLE_LABEL[k]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {canBranch ? (
          <fieldset className="chip-field" aria-label="Địa điểm được cấp">
            <legend>Địa điểm được cấp (chỉ Văn thư, Kế toán)</legend>
            <div className="chip-row">
              <label className="chip-radio">
                <input
                  type="radio"
                  name="branchId"
                  value=""
                  checked={branchId === ''}
                  onChange={() => setBranchId('')}
                />
                <span>Chưa cấp</span>
              </label>
              {branches.map((b) => (
                <label key={b.id} className="chip-radio">
                  <input
                    type="radio"
                    name="branchId"
                    value={b.id}
                    checked={branchId === b.id}
                    onChange={() => setBranchId(b.id)}
                  />
                  <span>{b.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        {canSign ? (
          <label className="toggle-row">
            <input name="legalSigner" type="checkbox" />
            <span className="toggle" aria-hidden="true" />
            <span>
              <strong>Cấp quyền ký pháp lý</strong>
              <small>Áp dụng cho Admin và Trưởng văn phòng.</small>
            </span>
          </label>
        ) : (
          <p className="muted">Quyền ký pháp lý chỉ áp dụng cho Admin và Trưởng văn phòng.</p>
        )}
        <fieldset className="chip-field" aria-label="Cách đăng nhập">
          <legend>Cách đăng nhập</legend>
          <label className="option-card">
            <input
              type="radio"
              name="login"
              checked={login === 'link'}
              onChange={() => setLogin('link')}
            />
            <span>
              <strong>Gửi link đăng nhập qua email (khuyến nghị)</strong>
              <small>
                Người dùng bấm link trong email để vào, không ai biết mật khẩu của họ. Cần cấu hình{' '}
                <Link href="/quan-tri/email">email gửi thư</Link>.
              </small>
            </span>
          </label>
          <label className="option-card">
            <input
              type="radio"
              name="login"
              checked={login === 'password'}
              onChange={() => setLogin('password')}
            />
            <span>
              <strong>Đặt mật khẩu tạm</strong>
              <small>
                Admin biết mật khẩu này nên có thể đăng nhập thay người đó; chỉ dùng khi chưa cấu
                hình email gửi thư.
              </small>
            </span>
          </label>
        </fieldset>
        {login === 'password' ? (
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
        ) : null}
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
        <div className="mf-actions">
          <Link className="btn-link" href="/quan-tri/nhan-su">
            Hủy
          </Link>
          <button type="submit" className="primary" disabled={busy}>
            Thêm và gửi đề xuất
          </button>
        </div>
      </section>
      <aside className="mf-side">
        <section className="side-card">
          <h2>Điều gì xảy ra sau khi gửi</h2>
          <ol className="steps">
            {STEPS.map(([a, b]) => (
              <li key={a}>
                <strong>{a}</strong>
                <small>{b}</small>
              </li>
            ))}
          </ol>
        </section>
        <p className="callout">
          <strong>Quy tắc hai người</strong>
          Admin đề xuất, Trưởng văn phòng duyệt. Không có đường đi tắt.
        </p>
      </aside>
    </form>
  );
}
