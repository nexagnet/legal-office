'use client';

import Link from 'next/link';
import {
  CONTRACT_STATUS_LABEL,
  SERVICE_KIND_LABEL,
  type Contract,
  type Customer,
} from '../lib/customers';
import { ContractExtras } from './ContractExtras';
import { ContractForm, NewContractForm } from './CustomerForms';

const dayVi = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');

/**
 * Hợp đồng của một khách (Figma N12 D8, tab Hợp đồng): mỗi hợp đồng một thẻ tóm tắt có trạng thái;
 * bấm "Xem và sửa" mở form, tệp và người tham gia của đúng hợp đồng đó. Phụ lục ở tab riêng.
 * Không có số tiền: kế toán xử lý tại MISA.
 */
export function CustomerContracts({
  customer,
  customers,
  contracts,
  baseHref,
  selectedId,
}: {
  readonly customer: Customer;
  readonly customers: readonly Customer[];
  readonly contracts: readonly Contract[];
  readonly baseHref: string;
  readonly selectedId: string | null;
}) {
  const selected = contracts.find((k) => k.id === selectedId) ?? null;
  return (
    <section className="panel" aria-labelledby="contracts-t">
      <h2 id="contracts-t">Hợp đồng</h2>
      {contracts.length === 0 ? (
        <p className="muted">Chưa gắn hợp đồng. Có thể tiếp nhận hồ sơ trước khi nhập hợp đồng.</p>
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0">
          {contracts.map((k) => (
            <li
              key={k.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-4"
            >
              <div className="grid gap-1">
                <strong className="text-[15px] text-ink">{k.externalRef}</strong>
                <span className="text-[13px] text-muted">
                  {k.serviceKind ? SERVICE_KIND_LABEL[k.serviceKind] : 'Chưa phân loại'} · hiệu lực{' '}
                  {dayVi(k.validFrom)} → {dayVi(k.validTo)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="pill" data-tone={k.status === 'ACTIVE' ? 'ok' : 'idle'}>
                  {CONTRACT_STATUS_LABEL[k.status] ?? k.status}
                </span>
                <Link
                  className="secondary btn-link"
                  href={`${baseHref}?tab=hop-dong&hd=${k.id}`}
                  aria-current={k.id === selected?.id ? 'true' : undefined}
                >
                  Xem và sửa
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
      {selected ? (
        <div className="contract-block" aria-label={`Hợp đồng ${selected.externalRef}`}>
          <ContractForm contract={selected} />
          <ContractExtras contractId={selected.id} customers={customers} />
        </div>
      ) : null}
      <NewContractForm customerId={customer.id} />
    </section>
  );
}
