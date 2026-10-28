import { KpiStrip } from '../../../components/KpiStrip';
import { PersonnelSheet } from '../../../components/PersonnelSheet';
import { TabNav } from '../../../components/ui/tab-nav';
import {
  PERSONNEL_TABS,
  filterPersonnel,
  insuranceLabel,
  loadPersonnel,
  parsePersonnelTab,
  personnelRoles,
  summarizePersonnel,
} from '../../../lib/personnel';
import { currentSession, requestCookie } from '../../../lib/server';

export const dynamic = 'force-dynamic';

export default async function PersonnelPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await currentSession();
  if (session.status !== 'authenticated') return null;
  const officeId = session.memberships[0]?.officeId ?? session.branches[0]?.officeId;
  if (!officeId) return <p className="muted">Chưa có văn phòng.</p>;
  const rows = await loadPersonnel(await requestCookie(), officeId);
  if (rows === 'error') {
    return (
      <div className="state" role="alert">
        <h2>Không tải được hồ sơ lao động</h2>
        <p>Chỉ Admin và Trưởng văn phòng xem được. Vui lòng thử lại sau.</p>
      </div>
    );
  }
  const tab = parsePersonnelTab((await searchParams).tab);
  const s = summarizePersonnel(rows);
  const branchName = new Map(session.branches.map((b) => [b.id, b.name]));
  const shown = filterPersonnel(rows, tab);
  return (
    <section aria-labelledby="t">
      <h1 id="t">Hồ sơ lao động</h1>
      <p className="muted">
        Nguồn dữ liệu cho sổ S-06. Mỗi lần lưu là một phiên bản mới, không ghi đè.
      </p>
      <div className="toolbar">
        <PersonnelSheet
          officeId={officeId}
          branches={session.branches}
          person={null}
          trigger="+ Thêm hồ sơ"
        />
      </div>
      <KpiStrip
        label="Tổng hợp hồ sơ lao động"
        items={[
          { label: 'Tổng nhân sự', value: s.total },
          { label: 'Đang làm việc', value: s.active },
          { label: 'Có quyết định Thừa hành viên', value: s.executors },
          { label: 'Thiếu hợp đồng lao động', value: s.missingContract, tone: 'warn' },
          { label: 'Chưa ghi bảo hiểm', value: s.insuranceUnset, tone: 'warn' },
        ]}
      />
      <TabNav
        label="Lọc hồ sơ lao động"
        active={tab}
        tabs={PERSONNEL_TABS.map((t) => ({
          key: t.key,
          label: t.label,
          href:
            t.key === 'tat-ca'
              ? '/quan-tri/ho-so-lao-dong'
              : `/quan-tri/ho-so-lao-dong?tab=${t.key}`,
          count: filterPersonnel(rows, t.key).length,
        }))}
      />
      {shown.length === 0 ? (
        <div className="state" role="status">
          <h2>Không có hồ sơ</h2>
          <p>Chưa có hồ sơ nào trong mục này.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Hồ sơ lao động, bản mới nhất của mỗi người</caption>
            <thead>
              <tr>
                <th scope="col">Họ tên</th>
                <th scope="col">Chuyên môn</th>
                <th scope="col">Chi nhánh</th>
                <th scope="col">QĐ Thừa hành viên</th>
                <th scope="col">HĐ lao động</th>
                <th scope="col">Bảo hiểm</th>
                <th scope="col">Vai trò</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Phiên bản</th>
                <th scope="col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.person_id}>
                  <th scope="row">{r.full_name}</th>
                  <td>{r.specialty ?? '—'}</td>
                  <td>{branchName.get(r.branch_id) ?? '—'}</td>
                  <td>{r.executor_decision_ref ?? '—'}</td>
                  <td>{r.labor_contract_ref ?? 'Chưa có'}</td>
                  <td>{insuranceLabel(r.insurance_purchased)}</td>
                  <td>{personnelRoles(r)}</td>
                  <td>{r.work_status === 'ACTIVE' ? 'Đang làm' : 'Đã nghỉ'}</td>
                  <td>v{r.version}</td>
                  <td>
                    <PersonnelSheet
                      officeId={officeId}
                      branches={session.branches}
                      person={r}
                      trigger="Cập nhật"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">
        Vai và địa điểm thay đổi qua đề xuất hai người (Admin đề xuất, Trưởng văn phòng duyệt),
        không sửa ở màn này.
      </p>
    </section>
  );
}
