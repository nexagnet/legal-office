import { Fragment } from 'react';
import { PlaceForm } from '../../../../components/PlaceForm';
import { type CaseLegal, getJson } from '../../../../lib/case-api';
import {
  SERVICE_KIND_LABEL,
  CONTRACT_STATUS_LABEL,
  type ServiceKind,
} from '../../../../lib/customers';
import { MISA_STATUS_LABEL, PARTY_KIND_LABEL } from '../../../../lib/messages';
import { requestCookie } from '../../../../lib/server';
import { renderStage } from '../stage';

export const dynamic = 'force-dynamic';

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : null);
const EMPTY = 'Chưa có';

function Rows({ rows }: { rows: readonly (readonly [string, string | null | undefined])[] }) {
  return (
    <dl className="info">
      {rows.map(([k, v]) => (
        <Fragment key={k}>
          <dt>{k}</dt>
          <dd>{v || EMPTY}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderStage(id, 'Thông tin pháp lý của hồ sơ', async ({ c }) => {
    const l = await getJson<CaseLegal>(
      `/vibang/cases/${encodeURIComponent(id)}/legal`,
      await requestCookie(),
    );
    if (typeof l !== 'object') {
      return (
        <div className="state" role="alert">
          <h2>Không tải được thông tin pháp lý</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      );
    }
    const isFinal = c.status === 'RETURNED' || c.status === 'CANCELLED';
    return (
      <div className="panels legal-grid">
        <section className="panel">
          <h2>Hợp đồng và khách hàng</h2>
          <Rows
            rows={[
              ['Hợp đồng', l.contract.ref],
              [
                'Loại dịch vụ',
                l.contract.serviceKind
                  ? (SERVICE_KIND_LABEL[l.contract.serviceKind as ServiceKind] ??
                    l.contract.serviceKind)
                  : null,
              ],
              ['Ngày ký', l.contract.signedOn],
              ['Hiệu lực từ', l.contract.validFrom],
              ['Hiệu lực đến', l.contract.validTo],
              [
                'Trạng thái hợp đồng',
                l.contract.status
                  ? (CONTRACT_STATUS_LABEL[l.contract.status] ?? l.contract.status)
                  : null,
              ],
              ['Khách hàng', l.customer.name],
              [
                'Loại chủ thể',
                l.customer.kind ? (PARTY_KIND_LABEL[l.customer.kind] ?? l.customer.kind) : null,
              ],
              ['Số định danh', l.customer.idNumber],
              ['Địa chỉ', l.customer.address],
              ['Điện thoại', l.customer.phone],
              ['Mã số thuế', l.customer.taxCode],
              ['Người đại diện', l.customer.representative],
            ]}
          />
          {l.customer.name === null ? (
            <p className="muted">Dữ liệu cá nhân của khách chỉ hiển thị cho vai tiếp nhận.</p>
          ) : null}
        </section>
        <section className="panel">
          <h2>Số, xác nhận và chứng cứ</h2>
          <Rows
            rows={[
              ['Số Vi bằng', l.number.label],
              ['Ngày cấp số', fmt(l.number.allocatedAt)],
              [
                'Xác nhận MISA',
                l.misa.status ? (MISA_STATUS_LABEL[l.misa.status] ?? l.misa.status) : null,
              ],
              ['Tham chiếu MISA', l.misa.reference],
              ['THV ký', l.signed.at ? `${fmt(l.signed.at)} · ${l.signed.byLabel ?? ''}` : null],
              [
                'Văn thư đóng dấu',
                l.stamped.at ? `${fmt(l.stamped.at)} · ${l.stamped.byLabel ?? ''}` : null,
              ],
              [
                'Bản scan cuối',
                l.finalScan.lockedAt ? `Đã khoá ${fmt(l.finalScan.lockedAt)}` : null,
              ],
              ['Hạn cập nhật Sở', fmt(l.registration.deadlineAt)],
            ]}
          />
          <PlaceForm caseId={c.id} placeAddress={l.placeAddress} canEdit={!isFinal} />
        </section>
      </div>
    );
  });
}
