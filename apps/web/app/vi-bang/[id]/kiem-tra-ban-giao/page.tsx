import Link from 'next/link';
import { CheckPanel } from '../../../../components/CheckPanel';
import { getJson } from '../../../../lib/case-api';
import {
  CONTACT_KIND_LABEL,
  CONTACT_OUTCOME_LABEL,
  type ContactEntry,
} from '../../../../lib/contacts';
import { requestCookie } from '../../../../lib/server';
import { renderStage } from '../stage';

export const dynamic = 'force-dynamic';

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : null);
const fmtDay = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('vi-VN') : null;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderStage(
    id,
    'Kiểm tra bàn giao & kết quả liên hệ khách',
    async ({ c, progress: p }) => {
      const res = await getJson<{ items: ContactEntry[] }>(
        `/vibang/cases/${encodeURIComponent(id)}/contacts`,
        await requestCookie(),
      );
      const last = typeof res === 'object' ? res.items[res.items.length - 1] : undefined;
      const contact = last
        ? `${CONTACT_KIND_LABEL[last.kind] ?? last.kind}, ${fmt(last.at)} · ${CONTACT_OUTCOME_LABEL[last.outcome] ?? last.outcome}`
        : 'Chưa có liên hệ khách';
      const received = c.handoverRecipient
        ? `${c.handoverRecipient} · ${fmtDay(c.handoverOn) ?? ''}`.replace(/ · $/, '')
        : 'Chưa ghi nhận người nhận';
      const revoked = p.misaRevokeStatus !== 'NONE';
      return (
        <div className="panels assign-grid">
          <section className="panel form">
            <h2>Ghi nhận bàn giao thực tế</h2>
            <label>
              Vi bằng
              <input readOnly value={p.numberLabel ?? c.title} />
            </label>
            <label>
              Xác nhận THV đã ký
              <input
                readOnly
                value={fmt(p.signedAt) ? `Đã xác nhận ${fmt(p.signedAt)}` : 'Chưa xác nhận'}
              />
            </label>
            <label>
              Văn thư đã đóng dấu
              <input
                readOnly
                value={fmt(p.stampedAt) ? `Đã xác nhận ${fmt(p.stampedAt)}` : 'Chưa xác nhận'}
              />
            </label>
            <label>
              Bản scan đã ký + dấu
              <input
                readOnly
                value={p.hasFinalScan ? 'Đã tải lên, đã khóa' : 'Chưa có bản scan cuối'}
              />
            </label>
            <label>
              Liên hệ khách
              <input readOnly value={contact} />
            </label>
            <label>
              Người thực tế nhận / ngày nhận
              <input readOnly value={received} />
            </label>
            {revoked ? (
              <label>
                Chặn do xác nhận MISA sai
                <input readOnly value="Đang có đề nghị thu hồi MISA" />
              </label>
            ) : null}
          </section>
          <CheckPanel
            title="Các điều kiện cuối"
            checks={[
              'Hai xác nhận THV + Văn thư hợp lệ',
              'Bản scan cuối đã được lưu và kiểm tra',
              'Không có chặn do xác nhận MISA sai',
              'Ghi người nhận và thời điểm bàn giao',
              'Theo dõi Sở là công việc độc lập',
            ]}
          >
            <Link className="primary btn-link wide" href={`/vi-bang/${c.id}/tra-ket-qua`}>
              Xác nhận đã trả kết quả
            </Link>
          </CheckPanel>
        </div>
      );
    },
  );
}
