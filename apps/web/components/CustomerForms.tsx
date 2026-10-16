'use client';

import type { FormEvent } from 'react';
import { postJson } from '../lib/post-json';
import {
  CONTRACT_STATUS_LABEL,
  SERVICE_KIND_LABEL,
  dayValue,
  type Contract,
  type Customer,
} from '../lib/customers';
import { useAction } from './useAction';

function Feedback({ error, notice }: { error: string | null; notice: string | null }) {
  return (
    <>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
      <p role="status" className="success" hidden={!notice}>
        {notice}
      </p>
    </>
  );
}

const text = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
/** Chỉ gửi trường có nội dung; máy chủ coi trường vắng mặt là để trống. */
const optional = (f: FormData, k: string) => (text(f, k) ? { [k]: text(f, k) } : {});

/** Thêm chủ thể mới theo mã ngoài; thông tin cá nhân nhập ở bước chỉnh sửa. Quyền do máy chủ kiểm. */
export function NewCustomerForm({ onCreated }: { readonly onCreated?: (id: string) => void }) {
  const api = useAction();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    let id: string | null | undefined;
    const ok = await api.run(async () => {
      const r = await postJson('/vibang/customers', {
        kind: String(f.get('kind')),
        externalRef: text(f, 'externalRef'),
      });
      id = r.label;
      return r;
    }, 'Đã thêm khách hàng. Chọn khách trong danh sách để nhập thông tin.');
    if (ok) {
      form.reset();
      if (id) onCreated?.(id);
    }
  }
  return (
    <form className="card form" onSubmit={submit} aria-labelledby="newcus-t">
      <h2 id="newcus-t">Thêm khách hàng</h2>
      <label>
        Loại
        <select name="kind" defaultValue="PERSON">
          <option value="PERSON">Cá nhân</option>
          <option value="ORGANIZATION">Tổ chức</option>
        </select>
      </label>
      <label>
        Mã khách hàng
        <input name="externalRef" required maxLength={200} />
      </label>
      <Feedback error={api.error} notice={api.notice} />
      <button type="submit" className="primary" disabled={api.busy}>
        Thêm khách hàng
      </button>
    </form>
  );
}

/** Sửa hồ sơ chủ thể. Cá nhân không có mã số thuế/người đại diện; tổ chức không có số giấy tờ. */
export function CustomerProfileForm({ customer }: { readonly customer: Customer }) {
  const api = useAction();
  const isPerson = customer.kind === 'PERSON';
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void api.run(
      () =>
        postJson(`/vibang/customers/${customer.id}/profile`, {
          displayName: text(f, 'displayName'),
          ...(isPerson ? optional(f, 'idNumber') : {}),
          ...optional(f, 'address'),
          ...optional(f, 'phone'),
          ...(isPerson ? {} : { ...optional(f, 'taxCode'), ...optional(f, 'representative') }),
        }),
      'Đã lưu thông tin khách hàng.',
    );
  }
  return (
    <form
      className="form profile-form"
      onSubmit={submit}
      aria-labelledby="profile-t"
      key={customer.id}
    >
      <h2 id="profile-t">Thông tin {isPerson ? 'cá nhân' : 'tổ chức'}</h2>
      <label>
        Tên hiển thị
        <input
          name="displayName"
          required
          maxLength={300}
          defaultValue={customer.displayName ?? ''}
        />
      </label>
      {isPerson ? (
        <label>
          Số giấy tờ tuỳ thân
          <input name="idNumber" maxLength={100} defaultValue={customer.idNumber ?? ''} />
        </label>
      ) : (
        <>
          <label>
            Mã số thuế
            <input name="taxCode" maxLength={100} defaultValue={customer.taxCode ?? ''} />
          </label>
          <label>
            Người đại diện
            <input
              name="representative"
              maxLength={300}
              defaultValue={customer.representative ?? ''}
            />
          </label>
        </>
      )}
      <label>
        Địa chỉ
        <input name="address" maxLength={500} defaultValue={customer.address ?? ''} />
      </label>
      <label>
        Điện thoại
        <input name="phone" maxLength={50} defaultValue={customer.phone ?? ''} />
      </label>
      <Feedback error={api.error} notice={api.notice} />
      <button type="submit" className="primary" disabled={api.busy}>
        {api.busy ? 'Đang lưu…' : 'Lưu thông tin'}
      </button>
    </form>
  );
}

/** Sửa một hợp đồng dịch vụ. Không có số tiền: kế toán xử lý tại MISA. */
export function ContractForm({ contract }: { readonly contract: Contract }) {
  const api = useAction();
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void api.run(
      () =>
        postJson(`/vibang/contracts/${contract.id}`, {
          serviceKind: text(f, 'serviceKind') || null,
          signedOn: text(f, 'signedOn') || null,
          validFrom: text(f, 'validFrom') || null,
          validTo: text(f, 'validTo') || null,
          status: text(f, 'status'),
          note: text(f, 'note'),
        }),
      'Đã lưu hợp đồng.',
    );
  }
  const label = `Hợp đồng ${contract.externalRef}`;
  return (
    <form className="form contract-form" onSubmit={submit} aria-label={label}>
      <h3>{label}</h3>
      <div className="form-grid">
        <label>
          Dịch vụ
          <select name="serviceKind" defaultValue={contract.serviceKind ?? ''}>
            <option value="">Chưa chọn</option>
            {Object.entries(SERVICE_KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Trạng thái
          <select name="status" defaultValue={contract.status}>
            {Object.entries(CONTRACT_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ngày ký
          <input type="date" name="signedOn" defaultValue={dayValue(contract.signedOn)} />
        </label>
        <label>
          Hiệu lực từ
          <input type="date" name="validFrom" defaultValue={dayValue(contract.validFrom)} />
        </label>
        <label>
          Hiệu lực đến
          <input type="date" name="validTo" defaultValue={dayValue(contract.validTo)} />
        </label>
      </div>
      <label>
        Ghi chú
        <textarea name="note" rows={2} maxLength={2000} defaultValue={contract.note ?? ''} />
      </label>
      <Feedback error={api.error} notice={api.notice} />
      <button type="submit" className="primary" disabled={api.busy}>
        Lưu hợp đồng
      </button>
    </form>
  );
}

/** Gắn một hợp đồng mới (theo mã ngoài) cho khách đang chọn. */
export function NewContractForm({ customerId }: { readonly customerId: string }) {
  const api = useAction();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const ok = await api.run(
      () =>
        postJson(`/vibang/customers/${customerId}/contracts`, {
          externalRef: text(f, 'externalRef'),
        }),
      'Đã thêm hợp đồng.',
    );
    if (ok) form.reset();
  }
  return (
    <form className="form" onSubmit={submit} aria-label="Thêm hợp đồng">
      <label>
        Mã hợp đồng mới
        <input name="externalRef" required maxLength={200} />
      </label>
      <Feedback error={api.error} notice={api.notice} />
      <button type="submit" className="primary" disabled={api.busy}>
        Thêm hợp đồng
      </button>
    </form>
  );
}
