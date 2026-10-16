import { ChangeDecision } from '../../../../components/ChangeRequestRow';
import { CheckPanel } from '../../../../components/CheckPanel';
import { type CaseDetail, getJson } from '../../../../lib/case-api';
import { requestCookie } from '../../../../lib/server';
import { renderStage } from '../stage';

export const dynamic = 'force-dynamic';

const FIELD_LABEL: Record<string, string> = { title: 'Tiêu đề', description: 'Nội dung' };

interface ChangeItem {
  readonly id: string;
  readonly reason: string;
  readonly before: Record<string, string>;
  readonly after: Record<string, string>;
  readonly status: string;
}

async function ChangeBody({ c, isAdmin }: { c: CaseDetail; isAdmin: boolean }) {
  const res = await getJson<{ items: ChangeItem[] }>(
    `/vibang/cases/${encodeURIComponent(c.id)}/change-requests`,
    await requestCookie(),
  );
  const pending = typeof res === 'object' ? res.items.filter((r) => r.status === 'PENDING') : [];
  if (res === 'error') {
    return (
      <div className="state" role="alert">
        <h2>Không tải được yêu cầu</h2>
        <p>Vui lòng thử lại sau.</p>
      </div>
    );
  }
  if (pending.length === 0) {
    return (
      <div className="state" role="status">
        <h2>Không có yêu cầu chờ duyệt</h2>
        <p>Hồ sơ này chưa có đề nghị sửa nào đang chờ Admin.</p>
      </div>
    );
  }
  return (
    <>
      {pending.map((r) => {
        const field = Object.keys(r.after)[0] ?? '';
        return (
          <div key={r.id} className="panels assign-grid">
            <section className="panel form">
              <h2>Yêu cầu chờ duyệt</h2>
              <label>
                Hồ sơ
                <input value={c.title} readOnly />
              </label>
              <label>
                Trường dữ liệu
                <input value={FIELD_LABEL[field] ?? field} readOnly />
              </label>
              <label>
                Giá trị cũ
                <input value={r.before[field] ?? ''} readOnly />
              </label>
              <label>
                Giá trị mới đề nghị
                <input value={r.after[field] ?? ''} readOnly />
              </label>
              <label>
                Lý do
                <input value={r.reason} readOnly />
              </label>
            </section>
            <CheckPanel
              title="Điều kiện phê duyệt"
              checks={[
                'Hết 48 giờ liên tục từ lúc tạo',
                'Admin xem chênh lệch trước / sau',
                'Không sửa âm thầm văn bản đã ký',
                'Không sửa số đã cấp',
                'Lưu ai đề xuất, ai duyệt, lý do',
              ]}
            >
              <ChangeDecision requestId={r.id} canDecide={isAdmin} wide />
            </CheckPanel>
          </div>
        );
      })}
    </>
  );
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderStage(id, 'Yêu cầu sửa hồ sơ sau 48 giờ', ({ c, roles }) => (
    <ChangeBody c={c} isAdmin={roles.includes('ADMIN')} />
  ));
}
