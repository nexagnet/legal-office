import Link from 'next/link';
import { CheckPanel } from '../../../../components/CheckPanel';
import { getJson } from '../../../../lib/case-api';
import { requestCookie } from '../../../../lib/server';
import { renderStage } from '../stage';

export const dynamic = 'force-dynamic';

interface Doc {
  readonly id: string;
  readonly kind: string;
  readonly version: number;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
}
interface Documents {
  readonly items: readonly Doc[];
  readonly signature: { readonly confirmedAt: string | null };
  readonly stamp: { readonly confirmedAt: string | null };
  readonly finalScan?: { readonly documentId: string; readonly lockedAt: string | null } | null;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : 'Chưa xác nhận');
const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderStage(id, 'Kho hồ sơ, chứng cứ và bản scan cuối', async ({ c }) => {
    const d = await getJson<Documents>(
      `/vibang/cases/${encodeURIComponent(id)}/documents`,
      await requestCookie(),
    );
    if (typeof d !== 'object') {
      return (
        <div className="state" role="alert">
          <h2>Không tải được tài liệu</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      );
    }
    return (
      <div className="panels assign-grid">
        <section className="panel form">
          <h2>Tài liệu hồ sơ {c.title}</h2>
          {d.items.length === 0 ? <p className="muted">Hồ sơ chưa có tài liệu nào.</p> : null}
          {d.items.map((x) => (
            <label key={x.id}>
              {x.kind} · phiên bản {x.version}
              <input
                readOnly
                value={`${fmt(x.createdAt)} · ${kb(x.sizeBytes)} · SHA-256 ${x.sha256.slice(0, 12)}…`}
              />
              <a href={`/api/vibang/cases/${c.id}/documents/${x.id}/file`}>Tải tệp</a>
            </label>
          ))}
          <label>
            Xác nhận chữ ký
            <input readOnly value={fmt(d.signature.confirmedAt)} />
          </label>
          <label>
            Xác nhận đóng dấu
            <input readOnly value={fmt(d.stamp.confirmedAt)} />
          </label>
          <label>
            Bản scan đã ký, đóng dấu
            <input
              readOnly
              value={d.finalScan ? `Đã khóa ${fmt(d.finalScan.lockedAt)}` : 'Chưa có bản scan cuối'}
            />
          </label>
        </section>
        <CheckPanel
          title="Kiểm soát bằng chứng"
          checks={[
            'Phân loại nháp và bản cuối',
            'Phiên bản và checksum mỗi tệp',
            'Lưu người upload và thời điểm',
            'Không ghi đè bản cuối âm thầm',
            'Cloud quản lý; hồ sơ giấy gốc tại VP',
          ]}
        >
          <Link className="primary btn-link wide" href={`/vi-bang/${c.id}/ky-dong-dau`}>
            Tải lên / Kiểm tra bản scan
          </Link>
        </CheckPanel>
      </div>
    );
  });
}
