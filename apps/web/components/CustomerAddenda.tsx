import { SERVICE_KIND_LABEL, type Contract } from '../lib/customers';
import { ContractAddenda } from './ContractAddenda';

/** Tab Phụ lục của khách (Figma N12 D8): phụ lục của từng hợp đồng, mỗi hợp đồng một khối. */
export function CustomerAddenda({ contracts }: { readonly contracts: readonly Contract[] }) {
  if (contracts.length === 0) {
    return (
      <div className="state" role="status">
        <h2>Chưa có hợp đồng</h2>
        <p>Phụ lục gắn với hợp đồng; hãy thêm hợp đồng ở tab Hợp đồng trước.</p>
      </div>
    );
  }
  return (
    <>
      {contracts.map((k) => (
        <section key={k.id} className="panel" aria-label={`Phụ lục của ${k.externalRef}`}>
          <h2>{k.externalRef}</h2>
          <p className="muted">
            {k.serviceKind ? SERVICE_KIND_LABEL[k.serviceKind] : 'Chưa phân loại'}
          </p>
          <ContractAddenda contractId={k.id} active />
        </section>
      ))}
    </>
  );
}
