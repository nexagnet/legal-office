'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';
import type { Branch } from '../app/session';

interface Props {
  readonly branches: readonly Branch[];
}

async function post(
  path: string,
  body: unknown,
): Promise<{ ok: boolean; code?: string; label?: string }> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { code?: string; label?: string };
  return { ok: res.ok, code: json.code, label: json.label };
}

/** Tạo khách rồi tạo hồ sơ (INTAKE). Mọi kiểm tra quyền do máy chủ làm; lỗi hiển thị nguyên nhân bằng tiếng Việt. */
export function NewCaseForm({ branches }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState('PERSON');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const branch = branches.find((b) => b.id === f.get('branchId'));
    if (!branch) return setError('Chọn chi nhánh.');
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const customer = await post('/vibang/customers', {
        kind: String(f.get('kind')),
        externalRef: String(f.get('customerRef') ?? ''),
      });
      if (!customer.ok || !customer.label) return setError(messageFor(customer.code));
      const profile = {
        displayName: String(f.get('displayName') ?? '').trim(),
        phone: String(f.get('phone') ?? '').trim(),
        idNumber: kind === 'PERSON' ? String(f.get('idNumber') ?? '').trim() : '',
      };
      if (profile.phone || profile.idNumber) {
        if (!profile.displayName)
          return setError('Cần nhập tên khách hàng khi nhập SĐT hoặc số định danh.');
      }
      if (profile.displayName) {
        const saved = await post(`/vibang/customers/${customer.label}/profile`, {
          displayName: profile.displayName,
          ...(profile.phone ? { phone: profile.phone } : {}),
          ...(profile.idNumber ? { idNumber: profile.idNumber } : {}),
        });
        if (!saved.ok) return setError(messageFor(saved.code));
      }
      const created = await post('/vibang/cases', {
        officeId: branch.officeId,
        branchId: branch.id,
        customerId: customer.label,
        title: String(f.get('title') ?? ''),
        description: String(f.get('description') ?? ''),
      });
      if (!created.ok) return setError(messageFor(created.code));
      form.reset();
      setKind('PERSON');
      setDone(true);
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  if (branches.length === 0) {
    return <p className="muted">Bạn chưa có chi nhánh nào để tiếp nhận hồ sơ.</p>;
  }
  return (
    <div className="intake">
      <div className="page-head">
        <h2 className="page-sub">Tạo hồ sơ Vi bằng</h2>
        <button type="submit" form="tao-ho-so" className="primary" disabled={busy} aria-busy={busy}>
          {busy ? 'Đang lưu…' : 'Tiếp nhận hồ sơ'}
        </button>
      </div>
      <div className="intake-grid">
        <form
          id="tao-ho-so"
          className="panel form intake-form"
          onSubmit={submit}
          aria-labelledby="new-case-title"
        >
          <h3 id="new-case-title">01 Thông tin tiếp nhận</h3>
          <div className="form-row">
            <label>
              Loại khách hàng
              <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="PERSON">Cá nhân</option>
                <option value="ORGANIZATION">Tổ chức</option>
              </select>
            </label>
            <label>
              Địa điểm tiếp nhận
              <select name="branchId" required defaultValue={branches[0]?.id}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Mã tham chiếu khách hàng
            <input name="customerRef" required maxLength={200} />
          </label>
          <label>
            Tên khách hàng
            <input name="displayName" maxLength={300} />
          </label>
          <div className="form-row">
            <label>
              Số điện thoại
              <input name="phone" type="tel" maxLength={50} />
            </label>
            {kind === 'PERSON' ? (
              <label>
                Số định danh cá nhân
                <input name="idNumber" maxLength={100} />
              </label>
            ) : null}
          </div>
          <label>
            Tiêu đề hồ sơ
            <input name="title" required maxLength={300} />
          </label>
          <label>
            Nội dung yêu cầu lập Vi bằng
            <textarea
              name="description"
              rows={3}
              maxLength={5000}
              placeholder="Mô tả ngắn sự kiện, hành vi cần lập Vi bằng..."
            />
          </label>
          <label>
            Thừa hành viên phụ trách
            <input
              value="Chưa phân công — chỉ Admin có quyền phân"
              disabled
              readOnly
              aria-readonly="true"
            />
          </label>
          <p role="alert" className="error" hidden={!error}>
            {error}
          </p>
          <p role="status" className="success" hidden={!done}>
            Đã tiếp nhận hồ sơ.
          </p>
        </form>
        <aside className="intake-side">
          <section className="panel" aria-labelledby="intake-rules">
            <h3 id="intake-rules">Quy tắc tiếp nhận</h3>
            <ul className="rules">
              <li>THV, Thư ký, Văn thư, Admin có thể tạo hồ sơ</li>
              <li>Admin là người duy nhất phân công THV</li>
              <li>Một Vi bằng có một THV phụ trách</li>
              <li>Được sửa hồ sơ trong 48 giờ đầu</li>
              <li>Sau 48 giờ phải gửi yêu cầu sửa cho Admin</li>
            </ul>
          </section>
          <section className="panel" aria-labelledby="intake-note">
            <h3 id="intake-note">Lưu ý</h3>
            <p className="muted">
              Đây là form tối giản khi tiếp nhận. Các thông tin pháp lý bắt buộc được bổ sung trước
              bước hoàn tất văn bản N-04.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
