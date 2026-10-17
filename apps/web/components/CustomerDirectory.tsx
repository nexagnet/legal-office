'use client';

import { useState } from 'react';
import { CONTRACT_STATUS_LABEL, type Contract, type Customer } from '../lib/customers';
import { PARTY_KIND_LABEL } from '../lib/messages';
import {
  ContractForm,
  CustomerProfileForm,
  NewContractForm,
  NewCustomerForm,
} from './CustomerForms';

interface Props {
  readonly customers: readonly Customer[];
  readonly contracts: readonly Contract[];
  readonly query: string;
  /** Số Vi bằng đã cấp theo khách (id khách → số); thiếu thì hiện gạch ngang. */
  readonly numberCounts?: Readonly<Record<string, number>>;
}

/**
 * Danh bạ chủ thể kiểu hàng-thẻ (Figma 3:184). Dữ liệu cá nhân chỉ do máy chủ trả cho vai tiếp nhận;
 * danh sách rỗng được nói rõ là rỗng hoặc không có quyền, không dựng dữ liệu thay thế.
 */
export function CustomerDirectory({ customers, contracts, query, numberCounts = {} }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = customers.find((c) => c.id === selectedId) ?? null;
  const contractsOf = (id: string) => contracts.filter((k) => k.customerId === id);

  return (
    <>
      {customers.length === 0 ? (
        <div className="state" role="status" data-state="empty">
          <h2>{query ? 'Không có khách hàng khớp' : 'Chưa có khách hàng nào hiển thị'}</h2>
          <p>
            {query
              ? 'Không có khách hàng nào khớp từ khoá tìm kiếm.'
              : 'Danh bạ còn trống, hoặc vai trò của bạn không được xem dữ liệu cá nhân của khách hàng (chỉ vai tiếp nhận được xem). Máy chủ quyết định quyền này.'}
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Danh bạ khách hàng</caption>
            <thead>
              <tr>
                <th scope="col">Khách hàng</th>
                <th scope="col">Loại</th>
                <th scope="col">Hợp đồng</th>
                <th scope="col">Vi bằng</th>
                <th scope="col">Địa chỉ</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => {
                const ks = contractsOf(c.id);
                return (
                  <tr key={c.id} data-selected={c.id === selectedId}>
                    <th scope="row">
                      {c.displayName || <span className="muted">Chưa có tên</span>}
                      <span className="muted small-ref"> · {c.externalRef}</span>
                    </th>
                    <td>{PARTY_KIND_LABEL[c.kind] ?? c.kind}</td>
                    <td>
                      {ks.length === 0
                        ? 'Chưa gắn hợp đồng'
                        : ks.map((k) => k.externalRef).join(', ')}
                    </td>
                    <td>{numberCounts[c.id] ?? '—'}</td>
                    <td>{c.address ?? '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="link-btn row-btn"
                        aria-pressed={c.id === selectedId}
                        onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                      >
                        {c.id === selectedId ? 'Đóng' : 'Xem và sửa'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {selected ? (
        <div className="panels customer-detail">
          <section className="panel" aria-label={`Khách hàng ${selected.externalRef}`}>
            <CustomerProfileForm customer={selected} />
          </section>
          <section className="panel" aria-labelledby="contracts-t">
            <h2 id="contracts-t">Hợp đồng của khách</h2>
            {contractsOf(selected.id).length === 0 ? (
              <p className="muted">
                Chưa gắn hợp đồng. Có thể tiếp nhận hồ sơ trước khi nhập hợp đồng.
              </p>
            ) : (
              contractsOf(selected.id).map((k) => (
                <div key={k.id} className="contract-block">
                  <p>
                    <span className="pill" data-tone={k.status === 'ACTIVE' ? 'ok' : 'idle'}>
                      {CONTRACT_STATUS_LABEL[k.status] ?? k.status}
                    </span>
                  </p>
                  <ContractForm contract={k} />
                </div>
              ))
            )}
            <NewContractForm customerId={selected.id} />
          </section>
        </div>
      ) : null}
      <NewCustomerForm onCreated={setSelectedId} />
      <section className="panel note-panel">
        <p>
          Một hợp đồng có thể liên kết nhiều Vi bằng. Có thể tiếp nhận hồ sơ trước khi nhập hợp
          đồng.
        </p>
        <p className="muted">
          Hệ thống không quản lý số tiền, công nợ hay thu chi; phần tài chính xử lý tại MISA.
        </p>
      </section>
    </>
  );
}
