import { DataTable } from '../../../../components/ui/data-table';
import Link from 'next/link';
import { ErrorRetry } from '../../../../components/ErrorRetry';
import { notFound } from 'next/navigation';
import { DmsDocumentsTab } from '../../../../components/DmsDocumentsTab';
import { DmsAdminEdit } from '../../../../components/DmsAdminEdit';
import { DmsAttributesForm } from '../../../../components/DmsAttributesForm';
import { DmsThvPicker } from '../../../../components/DmsThvActions';
import { DmsDraftActions, DmsMultiUpload } from '../../../../components/DmsCaseActions';
import { OTHER_KIND } from '../../../../lib/dms-other-kind';
import { DmsCaseExtrasForm } from '../../../../components/DmsCaseExtrasForm';
import { AdminBanner } from '../../../../components/admin-banner';
import { Button } from '../../../../components/ui/button';
import { InfoCard, InfoGrid, NoticeBar } from '../../../../components/ui/case-detail';
import { TabNav } from '../../../../components/ui/tab-nav';
import {
  BOOK_OF_DOMAIN,
  canAddDocument,
  canConfirm,
  canDraft,
  domainBySlug,
  isVanThu,
  inputColumns,
  loadDmsBookRows,
  loadDmsBooks,
  loadDmsCase,
  loadDmsDocuments,
  diffRevision,
  loadDmsFiles,
  loadDmsRevisions,
  loadMyDmsPermissions,
  type DmsBookColumn,
  loadThvOptions,
} from '../../../../lib/dms';
import { withCaseNumber } from '../../../../lib/dms-number';
import { actionLabel, activityNote, loadCaseHistory } from '../../../../lib/dms-activity';
import { currentSession, requestCookie } from '../../../../lib/server';

export const dynamic = 'force-dynamic';

const fmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});
const STATUS: Record<string, string> = {
  DRAFT: 'Nháp',
  RECORDED: 'Đã ghi sổ',
  CANCELLED: 'Đã hủy',
};

/**
 * Thông tin cấp hợp đồng/quyết định từng nghiệp vụ (Figma "Tạo hồ sơ ..."); lưu trong thuộc tính hồ sơ, KHÔNG phải cột sổ nên
 * nằm ở mục C (mục A chỉ có đúng các cột sổ S-0x). Tống đạt (từ 13/11/2026) cũng một hồ sơ một dòng Sổ S-01: các cột S-01 nằm ở mục A.
 */
const col = (no: number, heading: string, key: string): DmsBookColumn => ({ no, heading, key });
const CONTRACT_CARDS: Readonly<
  Record<string, readonly { title: string; cols: readonly DmsBookColumn[] }[]>
> = {
  tongdat: [
    {
      title: 'Hợp đồng dịch vụ tống đạt (N-01)',
      cols: [
        col(1, 'Số hợp đồng (nhập theo bản thực tế)', 'so_hop_dong'),
        col(2, 'Ngày ký', 'ngay_ky'),
        col(3, 'Bên yêu cầu (Bên B)', 'ben_yeu_cau'),
        col(4, 'Tên cơ quan', 'ten_co_quan'),
        col(5, 'Người đại diện Bên B', 'nguoi_dai_dien'),
      ],
    },
  ],
  xacminh: [
    {
      title: 'Hợp đồng dịch vụ xác minh điều kiện thi hành án (N-05)',
      cols: [
        col(1, 'Số hợp đồng (nhập theo bản thực tế)', 'so_hop_dong'),
        col(2, 'Ngày ký', 'ngay_ky'),
        col(3, 'Người yêu cầu (Bên B)', 'nguoi_yeu_cau_xm'),
        col(4, 'Đối tượng xác minh', 'doi_tuong_xac_minh'),
        col(5, 'Nội dung yêu cầu xác minh', 'noi_dung_yeu_cau_xm'),
      ],
    },
    {
      title: 'Quyết định xác minh (N-06): có thể bổ sung sau khi lưu hồ sơ',
      cols: [
        col(1, 'Số quyết định (nhập theo bản đã ký)', 'so_quyet_dinh'),
        col(2, 'Ngày quyết định', 'ngay_quyet_dinh'),
        col(3, 'Căn cứ bản án/quyết định', 'can_cu'),
        col(4, 'Hình thức xác minh', 'hinh_thuc_xac_minh'),
      ],
    },
  ],
  tochuc: [
    {
      title: 'Hợp đồng dịch vụ thi hành án (N-07)',
      cols: [
        col(1, 'Số hợp đồng (nhập theo bản thực tế)', 'so_hop_dong'),
        col(2, 'Ngày ký', 'ngay_ky'),
        col(3, 'Bên yêu cầu (Bên B)', 'ben_yeu_cau'),
        col(4, 'Bên phải thi hành', 'ben_phai_thi_hanh'),
        col(5, 'Khoản cần thi hành', 'khoan_can_thi_hanh'),
        col(6, 'Bản án/quyết định', 'ban_an_quyet_dinh'),
        col(7, 'Thời hạn', 'thoi_han'),
      ],
    },
  ],
};

/** Các tab của trang chi tiết (Figma "Vi bằng · Chi tiết hồ sơ"): chọn bằng `?tab=`. */
const TABS = [
  { key: 'chung', label: 'Thông tin chung' },
  { key: 'tai-lieu', label: 'Tài liệu' },
  { key: 'so', label: 'Sổ liên quan' },
  { key: 'lich-su', label: 'Lịch sử hồ sơ' },
] as const;
type TabKey = (typeof TABS)[number]['key'];
/** Tab "Tệp đính kèm" (?tab=scan) và "Phiên bản cũ" (?tab=phien-ban) đã gộp vào tab Tài liệu; đường dẫn cũ vẫn mở đúng chỗ. */
const LEGACY_TABS: Record<string, TabKey> = { scan: 'tai-lieu', 'phien-ban': 'tai-lieu' };
const activeTab = (raw: string | undefined): TabKey =>
  TABS.find((t) => t.key === raw)?.key ?? (raw ? LEGACY_TABS[raw] : undefined) ?? 'chung';

export default async function DmsCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string; id: string }>;
  searchParams: Promise<{ tab?: string; file?: string }>;
}) {
  const { domain: slug, id } = await params;
  const sp = await searchParams;
  const tab = activeTab(sp.tab);
  const domain = domainBySlug(slug);
  if (!domain) notFound();
  const session = await currentSession();
  if (session.status !== 'authenticated') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">{domain.label}</h1>
        <div className="state" role="alert">
          <h2>Cần đăng nhập</h2>
          <p>
            <Link href="/login">Đăng nhập</Link> để xem hồ sơ.
          </p>
        </div>
      </section>
    );
  }
  const cookie = await requestCookie();
  const c = await loadDmsCase(cookie, id);
  if (c === 'not-found' || (c !== 'error' && c.domain !== domain.code)) notFound();
  if (c === 'error') {
    return (
      <section aria-labelledby="t">
        <h1 id="t">{domain.label}</h1>
        <ErrorRetry
          title="Lỗi tải dữ liệu"
          message="Không tải được hồ sơ. Kiểm tra kết nối và thử lại."
        />
      </section>
    );
  }
  const isDraft = c.status === 'DRAFT';
  const [documents, permissions, books, thvOptions] = await Promise.all([
    loadDmsDocuments(cookie, id),
    loadMyDmsPermissions(cookie, c.office_id),
    loadDmsBooks(cookie, true),
    isDraft ? loadThvOptions(cookie) : Promise.resolve([]),
  ]);
  // Sau khi ghi sổ chỉ Admin sửa nội dung (N5); nhân viên chỉ tải thêm scan. Máy chủ vẫn kiểm lại (ADMIN_ONLY).
  const isAdmin = permissions.includes('dms.permission.approve');
  const canAdminEdit = c.status === 'RECORDED' && isAdmin;
  // Xóa scan (N6) là quyền riêng, không phải quyền của vai trò: chỉ hiện nút với người được cấp.
  const canDeleteScan = c.status !== 'CANCELLED' && permissions.includes('dms.scan.delete');
  const hasPhone = !isVanThu(domain.code);
  const book = books === 'error' ? undefined : books.find((b) => b.domain === domain.code);
  const docs = documents === 'error' ? [] : documents;
  // Cột THV của sổ (cả 4 sổ đều có): chữ ghi ở thuộc tính hồ sơ.
  const THV_KEY = 'thua_hanh_vien';
  const hasThvColumn = Boolean(book?.columns.some((col) => col.key === THV_KEY));
  const thvText = String(c.attributes[THV_KEY] ?? '');
  const thvTarget =
    !hasThvColumn || !book
      ? null
      : ({ kind: 'case', title: c.title, attributes: c.attributes } as const);
  // Tải lên không phân loại, không giới hạn số tệp (4 nghiệp vụ): mọi tệp vào tài liệu chung "Tài liệu khác" của hồ sơ
  // (tạo ở lần tải đầu tiên), tài liệu này không vào Sổ S-01. Dùng được cả khi hồ sơ đã ghi sổ.
  const canUpload =
    documents !== 'error' &&
    !isVanThu(domain.code) &&
    c.status !== 'CANCELLED' &&
    canAddDocument(permissions, domain.code);
  const filesByDoc = await Promise.all(docs.map((d) => loadDmsFiles(cookie, d.id)));
  const fileCount = filesByDoc.reduce((n, f) => n + f.length, 0);
  const docsWithoutScan = docs.filter((_, i) => !filesByDoc[i]!.some((f) => f.is_scan)).length;

  // STT của hồ sơ trong sổ (chỉ hồ sơ đã ghi sổ): lấy từ dữ liệu sổ của năm ghi sổ.
  const bookCode = BOOK_OF_DOMAIN[domain.code];
  const recordedYear = c.recorded_at
    ? Number(
        new Intl.DateTimeFormat('en-CA', { year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(
          new Date(c.recorded_at),
        ),
      )
    : null;
  const bookRows =
    tab === 'so' && bookCode && recordedYear
      ? await loadDmsBookRows(cookie, c.office_id, bookCode, recordedYear)
      : null;
  const stt =
    bookRows && bookRows !== 'error'
      ? bookRows.rows.filter((r) => r.case_id === c.id).map((r) => r.stt)
      : [];

  const creatorName = c.created_by_name;
  const history = tab === 'lich-su' ? await loadCaseHistory(cookie, c.id) : [];
  const revisions = tab === 'lich-su' ? await loadDmsRevisions(cookie, c.id) : [];
  const headingOf = new Map<string, string>(
    (book?.columns ?? []).map((col) => [col.key, col.heading]),
  );
  const base = `/dms/${domain.slug}/${c.id}`;
  const listKey = isVanThu(domain.code) ? 'tab' : 'loc';
  const backQuery = isDraft
    ? `?${listKey}=nhap`
    : c.status === 'CANCELLED'
      ? `?${listKey}=da-huy`
      : '';
  // Tiêu đề theo Figma T1: "Vi bằng số 031/2026/VB-THV ngày 12/11/2026" (ngày ghi sổ, chưa ghi sổ thì ngày tạo).
  const headingDate = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(c.recorded_at ?? c.created_at));
  const heading = c.case_number
    ? `${domain.label} số ${c.case_number} ngày ${headingDate}`
    : `${c.title} · Chi tiết hồ sơ`;
  return (
    <section aria-labelledby="t">
      <AdminBanner
        crumb={[
          [domain.label, `/dms/${domain.slug}${backQuery}`],
          [c.case_number ? `Hồ sơ ${c.case_number}` : c.title, undefined],
        ]}
        title={heading}
      />
      <h1 id="t" className="sr-only">
        {heading}
      </h1>
      <p className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className="chip"
          data-tone={isDraft ? 'warn' : c.status === 'CANCELLED' ? 'danger' : 'ok'}
        >
          {STATUS[c.status]}
        </span>
        <span className="chip" data-tone="info">
          {c.document_count} tài liệu
        </span>
        <span className="chip" data-tone={c.scan_count > 0 ? 'ok' : 'danger'}>
          {c.scan_count} scan
        </span>
        {docsWithoutScan > 0 && docs.length > 0 ? (
          <span className="chip" data-tone="warn">
            {docsWithoutScan} tài liệu chưa có bản scan
          </span>
        ) : null}
      </p>
      <TabNav
        underline
        label={`Chi tiết hồ sơ ${c.title}`}
        active={tab}
        tabs={[
          ...TABS.map((t) => ({
            key: t.key,
            label: t.label,
            href: t.key === 'chung' ? base : `${base}?tab=${t.key}`,
            count: t.key === 'tai-lieu' ? fileCount : undefined,
          })),
        ]}
      />
      {c.status === 'RECORDED' && !canAdminEdit ? (
        <NoticeBar lock action={<Link href={`${base}?tab=lich-su`}>Xem lịch sử</Link>}>
          Hồ sơ đã ghi sổ: nhân viên chỉ tải thêm scan. Cần sửa hồ sơ hoặc xóa scan: liên hệ Admin.
        </NoticeBar>
      ) : null}
      {c.status === 'CANCELLED' ? (
        <NoticeBar tone="info">Bản nháp đã hủy. Lý do: {c.cancel_reason ?? '—'}.</NoticeBar>
      ) : null}
      {tab === 'chung' && isDraft ? (
        <div className="grid gap-4">
          <p className="rounded-xl bg-[#fdf0d5] px-4 py-2 text-sm text-[#5a3d00]">
            <strong>Bản nháp</strong> · Chưa ghi {book?.code ?? 'sổ'}; sửa tự do cho đến khi bấm
            "Xác nhận lưu chính thức".
          </p>
          <section aria-labelledby="sec-a" className="rounded-2xl bg-surface p-5 shadow-sm">
            <h2 id="sec-a">
              A. Thông tin {domain.label}
              {book ? ` — phục vụ Sổ ${book.code}` : ''}
            </h2>
            {canDraft(permissions, domain.code) && !isVanThu(domain.code) ? (
              <DmsThvPicker
                caseId={c.id}
                options={thvOptions}
                currentId={c.thv_user_id}
                confirmed={c.thv_confirmed}
                text={thvText}
                target={thvTarget}
              />
            ) : null}
            {book && book.source === 'case' && canDraft(permissions, domain.code) ? (
              <DmsAttributesForm
                url={`/api/dms/cases/${c.id}/draft`}
                columns={inputColumns(book).filter((col) => col.key !== THV_KEY)}
                current={c.attributes}
                fixed={{ title: c.title }}
                legend={`Nội dung vào sổ ${book.code}`}
                domain={domain.code}
                caseNumber={c.case_number}
              />
            ) : null}
          </section>
          <section aria-labelledby="sec-b" className="rounded-2xl bg-surface p-5 shadow-sm">
            <h2 id="sec-b">B. Tài liệu đính kèm</h2>
            {canUpload ? <DmsMultiUpload caseId={c.id} /> : null}
            {docs.length === 0 ? (
              <p className="muted">Chưa có tài liệu.</p>
            ) : (
              <ul className="m-0 grid list-none gap-2 p-0">
                {docs.map((d, i) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-head px-4 py-3 text-sm"
                  >
                    <span>
                      <strong>{d.title}</strong>
                      <br />
                      <span className="muted">
                        {filesByDoc[i]!.length === 0
                          ? 'Chưa chọn file'
                          : `${filesByDoc[i]!.length} tệp · đã chọn`}
                      </span>
                    </span>
                    <Button asChild variant="secondary">
                      <Link className="no-underline" href={`${base}?tab=tai-lieu`}>
                        Tải lên
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {canDraft(permissions, domain.code) ? (
            <section aria-labelledby="sec-c" className="rounded-2xl bg-surface p-5 shadow-sm">
              <h2 id="sec-c">C. Thông tin khác — không vào sổ</h2>
              <DmsCaseExtrasForm
                caseId={c.id}
                title={c.title}
                current={c.attributes}
                withPhone={hasPhone}
              />
              {(CONTRACT_CARDS[domain.code] ?? []).map((card) => (
                <DmsAttributesForm
                  key={card.title}
                  url={`/api/dms/cases/${c.id}/draft`}
                  columns={card.cols}
                  current={c.attributes}
                  fixed={{ title: c.title }}
                  legend={card.title}
                />
              ))}
            </section>
          ) : null}
          <DmsDraftActions
            caseId={c.id}
            canRecord={canConfirm(permissions, domain.code)}
            canCancel={canDraft(permissions, domain.code)}
          />
        </div>
      ) : null}

      {tab === 'chung' && !isDraft ? (
        <>
          <InfoCard title="Thông tin chung" id="info-chung">
            <InfoGrid
              items={[
                ['Số hồ sơ', c.case_number ?? '—'],
                ['Tên hồ sơ', c.title],
                ...(hasPhone ? ([['SĐT khách hàng', c.phone ?? '—']] as const) : []),
                ['Trạng thái', STATUS[c.status] ?? c.status],
                ['Người tạo', creatorName ?? '—'],
                ['Ngày tạo', fmt.format(new Date(c.created_at))],
                ['Ghi sổ', c.recorded_at ? fmt.format(new Date(c.recorded_at)) : '—'],
                ...(c.status === 'CANCELLED'
                  ? ([['Lý do hủy nháp', c.cancel_reason ?? '—']] as const)
                  : []),
              ]}
            />
            {canAdminEdit && (hasPhone || (book && book.source === 'case')) ? (
              <div className="mt-4 flex justify-end">
                <DmsAdminEdit
                  target="case"
                  id={c.id}
                  columns={book && book.source === 'case' ? inputColumns(book) : []}
                  current={c.attributes}
                  currentTitle={c.title}
                  withPhone={hasPhone}
                  domain={domain.code}
                  caseNumber={c.case_number}
                />
              </div>
            ) : null}
          </InfoCard>
          {!isDraft && book && book.source === 'case' ? (
            <InfoCard title={`Nội dung sổ ${book.code}`} id="info-so">
              <InfoGrid
                items={inputColumns(book).map((col) => {
                  const v = String(c.attributes[col.key] ?? '');
                  return [
                    col.heading,
                    col.autoNumber ? withCaseNumber(c.case_number, v) : v,
                  ] as const;
                })}
              />
            </InfoCard>
          ) : null}
        </>
      ) : null}

      {tab === 'tai-lieu' ? (
        <DmsDocumentsTab
          caseId={c.id}
          base={base}
          previewId={sp.file}
          canUpload={canUpload}
          canAddScan={c.status !== 'CANCELLED'}
          canDeleteScan={canDeleteScan}
          groups={docs.map((d, i) => ({
            id: d.id,
            title: d.title,
            kind: d.kind,
            isOfficial: d.is_official,
            files: filesByDoc[i]!,
            adminEdit:
              canAdminEdit && book && book.source === 'document' && d.kind !== OTHER_KIND ? (
                <DmsAdminEdit
                  target="document"
                  id={d.id}
                  columns={inputColumns(book)}
                  current={d.attributes}
                  buttonLabel="Sửa thông tin (Admin)"
                  domain={domain.code}
                  caseNumber={c.case_number}
                />
              ) : undefined,
          }))}
        />
      ) : null}

      {tab === 'lich-su' ? (
        <>
          <section aria-labelledby="rev-title" className="grid gap-3">
            <h2 id="rev-title">Thay đổi nội dung</h2>
            {revisions.length <= 1 ? (
              <p className="muted">Hồ sơ chưa có bản sửa nào.</p>
            ) : (
              revisions.slice(1).map((r, i) => {
                const prev = revisions[i]!;
                const changes = diffRevision(prev, r);
                return (
                  <article key={r.rev} className="rounded-2xl bg-surface p-5 shadow-sm">
                    <h3>
                      So sánh phiên bản v{prev.rev + 1} → v{r.rev + 1}
                    </h3>
                    <p className="muted text-sm">
                      {fmt.format(new Date(r.created_at))} · {r.created_by_name ?? '—'} · Lý do:{' '}
                      {r.reason ?? '—'}
                    </p>
                    {changes.length === 0 ? (
                      <p className="muted">
                        Không có trường dữ liệu nào thay đổi (chỉ thêm bản scan).
                      </p>
                    ) : (
                      changes.map((ch) => {
                        const label =
                          ch.key === 'title'
                            ? 'Tiêu đề'
                            : (headingOf.get(ch.key)?.replace(/\s*\(.*?\)/g, '') ?? ch.key);
                        return (
                          <div key={ch.key} className="mt-2 grid gap-2 sm:grid-cols-2">
                            <p className="rounded-lg bg-[#fde8e5] px-3 py-2 text-sm">
                              Trước (v{prev.rev + 1}): {label}: {ch.before || '—'}
                            </p>
                            <p className="rounded-lg bg-[#dff3e6] px-3 py-2 text-sm">
                              Sau (v{r.rev + 1}): {label}: {ch.after || '—'}
                            </p>
                          </div>
                        );
                      })
                    )}
                  </article>
                );
              })
            )}
          </section>
          <section aria-labelledby="hist-title" className="mb-5 grid gap-3">
            <h2 id="hist-title">Lịch sử hồ sơ</h2>
            <p className="muted text-sm">Mới nhất trước. Người tạo hồ sơ: {creatorName ?? '—'}.</p>
            {history.length === 0 ? (
              <p className="muted">Chưa có hoạt động nào được ghi.</p>
            ) : (
              <DataTable tableKey="dms-case-history">
                <table>
                  <caption className="sr-only">Lịch sử hồ sơ</caption>
                  <thead>
                    <tr>
                      <th scope="col">Thời gian</th>
                      <th scope="col">Người làm</th>
                      <th scope="col">Việc đã làm</th>
                      <th scope="col">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h) => (
                      <tr key={h.id}>
                        <td>{fmt.format(new Date(h.at))}</td>
                        <td>{h.actor_label ?? 'Hệ thống'}</td>
                        <td>{actionLabel(h.action)}</td>
                        <td>{activityNote(h) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTable>
            )}
          </section>
        </>
      ) : null}

      {tab === 'so' ? (
        <p>
          {bookCode ? (
            <>
              Sổ {bookCode} năm {recordedYear ?? '—'}:{' '}
              {stt.length > 0 ? `STT ${stt.join(', ')}` : 'chưa có STT (hồ sơ chưa ghi sổ)'}.{' '}
              <Link href={`/dms/so/${bookCode.toLowerCase()}`}>Xem trước và xuất {bookCode}</Link>
            </>
          ) : 'bookSlug' in domain ? (
            <Link href={`/dms/so/${domain.bookSlug}`}>Xem trước và xuất sổ {domain.label}</Link>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
