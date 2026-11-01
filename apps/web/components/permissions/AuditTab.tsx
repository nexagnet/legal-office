import Link from 'next/link';
import { FilterChips } from '../ui/filter-chips';
import {
  RESULT_LABEL,
  describeRequest,
  formatWhen,
  normalizeText,
  requestCode,
  resultOf,
  type NameBook,
  type PermissionRequest,
  type RequestResult,
} from '../../lib/permission-model';
import { NoteBox, Pill, type PillTone } from './Pill';

type Loc = 'tat-ca' | 'cap' | 'thu-hoi' | 'bi-chan';

const RESULT_TONE: Record<RequestResult, PillTone> = {
  pending: 'brass',
  applied: 'ok',
  auto: 'ok',
  rejected: 'danger',
};

const href = (loc: Loc, q: string) => {
  const p = new URLSearchParams({ tab: 'nhat-ky' });
  if (loc !== 'tat-ca') p.set('loc', loc);
  if (q) p.set('q', q);
  return `/quan-tri/phan-quyen?${p}`;
};

const isLoc = (v: string | undefined): v is Loc =>
  v === 'cap' || v === 'thu-hoi' || v === 'bi-chan';

const matches = (r: PermissionRequest, loc: Loc) =>
  loc === 'tat-ca' ||
  (loc === 'cap' && (r.kind === 'GRANT' || r.kind === 'ADD_MEMBER')) ||
  (loc === 'thu-hoi' && (r.kind === 'REVOKE' || r.kind === 'REMOVE_MEMBER')) ||
  (loc === 'bi-chan' && r.status === 'REJECTED');

/**
 * Tab "Nhật ký phân quyền" (Figma P10). Mỗi yêu cầu là một dòng và không bao giờ sửa/xóa: DB chỉ cho đổi trường duyệt
 * một lần, nên danh sách yêu cầu chính là nhật ký thay đổi quyền.
 */
export function AuditTab({
  requests,
  names,
  searchParams,
}: {
  readonly requests: readonly PermissionRequest[];
  readonly names: NameBook;
  readonly searchParams: { loc?: string; q?: string };
}) {
  const loc: Loc = isLoc(searchParams.loc) ? searchParams.loc : 'tat-ca';
  const q = normalizeText((searchParams.q ?? '').trim());
  const shown = requests.filter(
    (r) =>
      matches(r, loc) &&
      (!q ||
        normalizeText(
          `${requestCode(r.id)} ${describeRequest(r, names)} ${names.userName(r.proposed_by)}`,
        ).includes(q)),
  );
  return (
    <>
      <div className="member-bar">
        <form className="contents" role="search" action="/quan-tri/phan-quyen">
          <input type="hidden" name="tab" value="nhat-ky" />
          {loc === 'tat-ca' ? null : <input type="hidden" name="loc" value={loc} />}
          <input
            type="search"
            name="q"
            aria-label="Tìm trong nhật ký"
            defaultValue={searchParams.q ?? ''}
            placeholder="Tìm tên, mã…"
            className="!max-w-[220px] !flex-none"
          />
        </form>
        <FilterChips
          label="Lọc nhật ký"
          active={loc}
          chips={[
            { key: 'tat-ca', label: 'Tất cả', href: href('tat-ca', q) },
            { key: 'cap', label: 'Cấp quyền', href: href('cap', q) },
            { key: 'thu-hoi', label: 'Thu hồi', href: href('thu-hoi', q) },
            { key: 'bi-chan', label: 'Bị từ chối', href: href('bi-chan', q) },
          ]}
        />
      </div>
      <div className="table-wrap member-card">
        <table>
          <caption className="sr-only">Nhật ký phân quyền</caption>
          <thead>
            <tr>
              <th scope="col">Thời điểm</th>
              <th scope="col">Đề xuất</th>
              <th scope="col">Duyệt</th>
              <th scope="col">Thay đổi</th>
              <th scope="col">Kết quả</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  Chưa có dòng nhật ký nào.
                </td>
              </tr>
            ) : (
              shown.map((r) => {
                const result = resultOf(r);
                return (
                  <tr key={r.id}>
                    <th scope="row">
                      <span className="grid">
                        <span>{formatWhen(r.proposed_at)}</span>
                        <Link className="person-mail" href={`/quan-tri/phan-quyen/yeu-cau/${r.id}`}>
                          {requestCode(r.id)}
                        </Link>
                      </span>
                    </th>
                    <td>{names.userName(r.proposed_by)}</td>
                    <td>
                      {r.reviewed_by ? (
                        <span className="grid">
                          <span>{names.userName(r.reviewed_by)}</span>
                          <span className="person-mail">
                            {formatWhen(r.reviewed_at ?? r.proposed_at)}
                          </span>
                        </span>
                      ) : (
                        '— chờ'
                      )}
                    </td>
                    <td className="max-w-[320px] text-sm">
                      {describeRequest(r, names)}
                      <span className="mt-1 block text-muted">Lý do: {r.reason}</span>
                      {r.review_reason ? (
                        <span className="block text-muted">Lý do từ chối: {r.review_reason}</span>
                      ) : null}
                    </td>
                    <td>
                      <Pill tone={RESULT_TONE[result]}>{RESULT_LABEL[result]}</Pill>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <NoteBox title="Nhật ký chỉ thêm, không xóa">
        Mỗi dòng giữ mã yêu cầu, người đề xuất, người duyệt, thời điểm và lý do. Yêu cầu đã duyệt
        hoặc từ chối không sửa lại được. Chưa có nút xuất bản sao nhật ký.
      </NoteBox>
    </>
  );
}
