'use client';

import { CONTRACT_STATUS_LABEL, type Contract, type Customer } from '../lib/customers';
import { ContractExtras } from './ContractExtras';
import { ContractForm, NewContractForm } from './CustomerForms';

/**
 * Hợp đồng của một khách (Figma N12 D8, tab Hợp đồng): mỗi hợp đồng một thẻ có trạng thái, form sửa,
 * tệp, người tham gia và phụ lục. Không có số tiền: kế toán xử lý tại MISA.
 */
export function CustomerContracts({
  customer,
  customers,
  contracts,
}: {
  readonly customer: Customer;
  readonly customers: readonly Customer[];
  readonly contracts: readonly Contract[];
}) {
  return (
    <section className="panel" aria-labelledby="contracts-t">
      <h2 id="contracts-t">Hợp đồng</h2>
      {contracts.length === 0 ? (
        <p className="muted">Chưa gắn hợp đồng. Có thể tiếp nhận hồ sơ trước khi nhập hợp đồng.</p>
      ) : (
        contracts.map((k) => (
          <div key={k.id} className="contract-block">
            <p>
              <span className="pill" data-tone={k.status === 'ACTIVE' ? 'ok' : 'idle'}>
                {CONTRACT_STATUS_LABEL[k.status] ?? k.status}
              </span>
            </p>
            <ContractForm contract={k} />
            <ContractExtras contractId={k.id} customers={customers} />
          </div>
        ))
      )}
      <NewContractForm customerId={customer.id} />
    </section>
  );
}
