import { DataTable } from '../ui/data-table';
import Link from 'next/link';
import { FilterChips } from '../ui/filter-chips';
import {
  KIND_LABEL,
  STATUS_LABEL,
  describeRequest,
  formatWhen,
  normalizeText,
  requestCode,
  requestSubject,
  type NameBook,
  type PermissionRequest,
} from '../../lib/permission-model';
import { NoteBox, Pill, type PillTone } from './Pill';

type Loc = 'cho-duyet' | 'da-xu-ly' | 'cua-toi';

const STATUS_TONE: Record<PermissionRequest['status'], PillTone> = {
  PENDING: 'brass',
  APPROVED: 'ok',
  REJECTED: 'danger',
};

const KIND_TONE: Record<PermissionRequest['kind'], PillTone> = {
  GRANT: 'info',
  REVOKE: 'warn',
  ADD_MEMBER: 'info',
  REMOVE_MEMBER: 'warn',
};

const href = (loc: Loc, q: string) => {
  const p = new URLSearchParams({ tab: 'yeu-cau' });
  if (loc !== 'cho-duyet') p.set('loc', loc);
  if (q) p.set('q', q);
  return `/quan-tri/phan-quyen?${p}`;
};

const isLoc = (v: string | undefined): v is Loc => v === 'da-xu-ly' || v === 'cua-toi';

/** Tab "Yêu cầu chờ duyệt" (Figma Q4). Bấm vào một yêu cầu để xem và duyệt/từ chối ở trang riêng. */
export function RequestsTab({
  requests,
  names,
  userId,
  searchParams,
  canPropose,
}: {
  readonly requests: readonly PermissionRequest[];
  readonly names: NameBook;
  readonly userId: string | null;
  readonly searchParams: { loc?: string; q?: string };
  readonly canPropose: boolean;
}) {
  const loc: Loc = isLoc(searchParams.loc) ? searchParams.loc : 'cho-duyet';
  const q = normalizeText((searchParams.q ?? '').trim());
  const pick = (l: Loc) =>
    requests.filter((r) =>
      l === 'cho-duyet'
        ? r.status === 'PENDING' && r.proposed_by !== userId
        : l === 'da-xu-ly'
          ? r.status !== 'PENDING'
          : r.proposed_by === userId,
    );
  const shown = pick(loc).filter(
    (r) =>
      !q ||
      normalizeText(`${requestCode(r.id)} ${describeRequest(r, names)} ${r.reason}`).includes(q),
  );
  const mine = loc === 'cho-duyet' ? pick('cua-toi').filter((r) => r.status === 'PENDING') : [];
  return (
    <>
      <div className="member-bar">
        <form className="contents" role="search" action="/quan-tri/phan-quyen">
          <input type="hidden" name="tab" value="yeu-cau" />
          {loc === 'cho-duyet' ? null : <input type="hidden" name="loc" value={loc} />}
          <input
            type="search"
            name="q"
            aria-label="Tìm yêu cầu"
            defaultValue={searchParams.q ?? ''}
            placeholder="Tìm yêu cầu…"
            className="!max-w-[220px] !flex-none"
          />
        </form>
        <div className="flex-1">
          <FilterChips
            label="Lọc yêu cầu"
            active={loc}
            chips={[
              {
                key: 'cho-duyet',
                label: 'Chờ bạn duyệt',
                href: href('cho-duyet', q),
                count: pick('cho-duyet').length,
              },
              {
                key: 'cua-toi',
                label: 'Do bạn đề xuất',
                href: href('cua-toi', q),
                count: pick('cua-toi').length,
              },
              {
                key: 'da-xu-ly',
                label: 'Đã xử lý',
                href: href('da-xu-ly', q),
                count: pick('da-xu-ly').length,
              },
            ]}
          />
        </div>
        {canPropose ? (
          <Link className="primary btn-link" href="/quan-tri/phan-quyen/de-xuat">
            + Đề xuất đổi quyền
          </Link>
        ) : null}
      </div>
      <DataTable tableKey="permissions-RequestsTab-1" className="member-card">
        <table>
          <caption className="sr-only">Yêu cầu đổi quyền</caption>
          <thead>
            <tr>
              <th scope="col">Mã</th>
              <th scope="col">Loại</th>
              <th scope="col">Đối tượng</th>
              <th scope="col">Nội dung</th>
              <th scope="col">Đề xuất</th>
              <th scope="col">Quyết định</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  {loc === 'cho-duyet'
                    ? 'Không có yêu cầu nào đang chờ duyệt.'
                    : 'Chưa có yêu cầu nào.'}
                </td>
              </tr>
            ) : (
              shown.map((r) => (
                <tr key={r.id}>
                  <th scope="row">
                    <Link
                      className="link-btn font-semibold whitespace-nowrap"
                      href={`/quan-tri/phan-quyen/yeu-cau/${r.id}`}
                    >
                      {requestCode(r.id)}
                    </Link>
                  </th>
                  <td>
                    <Pill tone={KIND_TONE[r.kind]}>{KIND_LABEL[r.kind]}</Pill>
                  </td>
                  <td className="font-semibold">{requestSubject(r, names)}</td>
                  <td className="max-w-[280px] text-sm">{describeRequest(r, names)}</td>
                  <td className="text-sm">
                    {names.userName(r.proposed_by)}
                    <br />
                    <span className="muted">{formatWhen(r.proposed_at)}</span>
                  </td>
                  <td>
                    {r.status === 'PENDING' && r.proposed_by !== userId ? (
                      <Link
                        className="link-btn font-semibold whitespace-nowrap"
                        href={`/quan-tri/phan-quyen/yeu-cau/${r.id}`}
                      >
                        Mở để xem so sánh ›
                      </Link>
                    ) : (
                      <Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Pill>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </DataTable>
      {mine.length > 0 ? (
        <section className="own-pending member-card" aria-labelledby="own-pending-t">
          <h2 id="own-pending-t" className="font-serif">
            Do bạn đề xuất · chờ người duyệt khác
          </h2>
          <ul>
            {mine.map((r) => (
              <li key={r.id}>
                <Link
                  className="link-btn font-semibold whitespace-nowrap"
                  href={`/quan-tri/phan-quyen/yeu-cau/${r.id}`}
                >
                  {requestCode(r.id)}
                </Link>
                <span>
                  {describeRequest(r, names)} · bạn đề xuất {formatWhen(r.proposed_at)}
                </span>
                <Pill tone="danger">Không có nút Duyệt</Pill>
              </li>
            ))}
          </ul>
          <p className="muted">
            Người đề xuất không tự duyệt đề xuất của mình, kể cả khi thuộc nhiều nhóm quyền. Chờ
            Admin khác có quyền duyệt xử lý trong Hộp duyệt.
          </p>
        </section>
      ) : null}
      <NoteBox tone="warn" title="Duyệt là áp dụng ngay, nhưng có kiểm tra lại">
        Khi bạn duyệt, hệ thống kiểm tra phiên bản nhóm hiện tại. Nếu nhóm đã đổi trong lúc chờ, đề
        xuất bị chặn. Từ chối phải ghi lý do. Chi tiết và nút quyết định nằm ở màn Duyệt thay đổi
        quyền.
      </NoteBox>
      <NoteBox title="Vì sao bạn có thể không thấy nút Duyệt?">
        Người đề xuất không được tự duyệt, kể cả khi thuộc nhiều nhóm. Admin khác có quyền duyệt
        thay đổi quyền nhận việc trong Hộp duyệt. Bấm vào mã yêu cầu để xem nội dung, người bị ảnh
        hưởng và quyết định. Admin tự đề xuất thì có hiệu lực ngay và được ghi vào Nhật ký phân
        quyền.
      </NoteBox>
    </>
  );
}
