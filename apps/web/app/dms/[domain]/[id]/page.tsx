import { DataTable } from '../../../../components/ui/data-table';
import Link from 'next/link';
import { ErrorRetry } from '../../../../components/ErrorRetry';
import { notFound } from 'next/navigation';
import { DmsAmendmentForm, DmsFileVersionForm } from '../../../../components/DmsAmendments';
import { DmsAttributesForm } from '../../../../components/DmsAttributesForm';
import { DmsThvPicker } from '../../../../components/DmsThvActions';
import {
  AddDmsDocumentForm,
  DmsDraftActions,
  UploadDmsFile,
} from '../../../../components/DmsCaseActions';
import { Button } from '../../../../components/ui/button';
import { TabNav } from '../../../../components/ui/tab-nav';
import {
  AMENDMENT_STATUS_LABEL,
  BOOK_OF_DOMAIN,
  amendmentSummary,
  loadDmsAmendments,
  canAddDocument,
  canConfirm,
  canDraft,
  canRequestAmendment,
  domainBySlug,
  isVanThu,
  inputColumns,
  loadDmsBookRows,
  loadDmsBooks,
  loadDmsCase,
  loadDmsDocuments,
  loadDmsFacets,
  diffRevision,
  loadDmsFiles,
  loadDmsRevisions,
  loadMyDmsPermissions,
  type DmsBookColumn,
  loadThvOptions,
} from '../../../../lib/dms';
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

/** Thông tin cấp hợp đồng/quyết định từng nghiệp vụ (Figma "Tạo hồ sơ ..."); lưu trong thuộc tính hồ sơ, tách khỏi cột sổ. Tống đạt: từng giấy tờ là một dòng Sổ S-01 ở thuộc tính tài liệu. */
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

const sizeLabel = (n: number | string) => `${Math.max(1, Math.round(Number(n) / 1024))} KB`;

/** Các tab của trang chi tiết (Figma "Vi bằng · Chi tiết hồ sơ"): chọn bằng `?tab=`. */
const TABS = [
  { key: 'chung', label: 'Thông tin chung' },
  { key: 'tai-lieu', label: 'Tài liệu' },
  { key: 'scan', label: 'Scan' },
  { key: 'phien-ban', label: 'Phiên bản' },
  { key: 'sua-doi', label: 'Yêu cầu sửa đổi' },
  { key: 'so', label: 'Sổ liên quan' },
] as const;
type TabKey = (typeof TABS)[number]['key'];
const activeTab = (raw: string | undefined): TabKey =>
  TABS.find((t) => t.key === raw)?.key ?? 'chung';

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
  const amendments =
    c.status === 'RECORDED' ? await loadDmsAmendments(cookie, c.office_id, { caseId: id }) : [];
  const canAmend =
    c.status === 'RECORDED' &&
    (canRequestAmendment(permissions, domain.code) ||
      permissions.includes('dms.permission.approve'));
  const book = books === 'error' ? undefined : books.find((b) => b.domain === domain.code);
  const docs = documents === 'error' ? [] : documents;
  const filesByDoc = await Promise.all(docs.map((d) => loadDmsFiles(cookie, d.id)));
  const pendingCount =
    amendments === 'error' ? 0 : amendments.filter((a) => a.status === 'PENDING').length;
  const fileCount = filesByDoc.reduce((n, f) => n + f.length, 0);
  const allFiles = filesByDoc.flat();
  const scanFileCount = allFiles.filter((f) => f.is_scan).length;
  const docsWithoutScan = docs.filter((_, i) => !filesByDoc[i]!.some((f) => f.is_scan)).length;
  const preview =
    allFiles.find((f) => f.id === sp.file) ?? allFiles.find((f) => f.is_scan) ?? allFiles[0];

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

  const creatorName = isDraft
    ? ((await loadDmsFacets(cookie, c.office_id, domain.code)).find((f) => f.case_id === c.id)
        ?.creator_name ?? null)
    : null;
  const revisions = tab === 'phien-ban' ? await loadDmsRevisions(cookie, c.id) : [];
  const headingOf = new Map<string, string>(
    (book?.columns ?? []).map((col) => [col.key, col.heading]),
  );
  // Mỗi tài liệu có từ hai phiên bản tệp cùng nhãn trở lên: xem cạnh nhau hai bản mới nhất.
  const pairs = filesByDoc.flatMap((list) => {
    const byLabel = new Map<string, typeof list>();
    for (const f of list) byLabel.set(f.label, [...(byLabel.get(f.label) ?? []), f]);
    return [...byLabel.values()]
      .filter((v) => v.length >= 2)
      .map((v) => {
        const sorted = [...v].sort((x, y) => x.version - y.version);
        return { older: sorted[sorted.length - 2]!, newer: sorted[sorted.length - 1]! };
      });
  });
  const base = `/dms/${domain.slug}/${c.id}`;
  const listKey = isVanThu(domain.code) ? 'tab' : 'loc';
  const backQuery = isDraft
    ? `?${listKey}=nhap`
    : c.status === 'CANCELLED'
      ? `?${listKey}=da-huy`
      : '';
  return (
    <section aria-labelledby="t">
      <p>
        <Link href={`/dms/${domain.slug}${backQuery}`}>← {domain.label}</Link>
      </p>
      <h1 id="t">{c.title}</h1>
      <p>
        <span
          className="chip"
          data-tone={isDraft ? 'warn' : c.status === 'CANCELLED' ? 'danger' : 'ok'}
        >
          {STATUS[c.status]}
        </span>{' '}
        <span className="chip" data-tone="info">
          {c.document_count} tài liệu
        </span>{' '}
        <span className="chip" data-tone={c.scan_count > 0 ? 'ok' : 'danger'}>
          {c.scan_count} scan
        </span>
      </p>
      {pendingCount > 0 ? (
        <div className="state" role="status" data-tone="warn">
          <p>
            Hồ sơ có {pendingCount} yêu cầu sửa đổi chờ Admin duyệt. Thông tin hiện hành giữ nguyên
            cho tới khi được duyệt. <Link href={`${base}?tab=sua-doi`}>Xem yêu cầu</Link>
          </p>
        </div>
      ) : null}
      {docs.length > 0 ? (
        <p className="rounded-xl bg-accent-soft px-4 py-2 text-sm font-medium text-accent">
          {docs.length} tài liệu · {scanFileCount} tệp scan
          {docsWithoutScan > 0
            ? ` · ${docsWithoutScan} tài liệu chưa có bản scan`
            : ' · mọi tài liệu đã có bản scan'}
        </p>
      ) : null}
      <TabNav
        label={`Chi tiết hồ sơ ${c.title}`}
        active={tab}
        tabs={TABS.map((t) => ({
          key: t.key,
          label: t.label,
          href: t.key === 'chung' ? base : `${base}?tab=${t.key}`,
          count:
            t.key === 'tai-lieu'
              ? docs.length
              : t.key === 'scan'
                ? scanFileCount
                : t.key === 'phien-ban'
                  ? fileCount
                  : t.key === 'sua-doi' && amendments !== 'error'
                    ? amendments.length
                    : undefined,
        }))}
      />

      {tab === 'chung' && isDraft ? (
        <div className="grid gap-4">
          <p className="rounded-xl bg-[#fdf0d5] px-4 py-2 text-sm text-[#5a3d00]">
            <strong>Bản nháp</strong> · Bản nháp, chưa ghi {book?.code ?? 'sổ'} chính thức. Chỉnh
            sửa tự do cho đến khi bấm "Xác nhận lưu chính thức"; chưa cấp{' '}
            {domain.code === 'vtden' ? 'Số đến' : 'STT'}, chưa vào xuất sổ.
          </p>
          <section aria-labelledby="sec-a" className="rounded-2xl bg-surface p-5 shadow-sm">
            <h2 id="sec-a">
              {CONTRACT_CARDS[domain.code]?.[0]
                ? CONTRACT_CARDS[domain.code]![0]!.title
                : `A. Thông tin ${domain.label}${book ? ` — phục vụ Sổ ${book.code}` : ''}`}
            </h2>
            {canDraft(permissions, domain.code) && !isVanThu(domain.code) ? (
              <DmsThvPicker
                caseId={c.id}
                options={thvOptions}
                currentId={c.thv_user_id}
                confirmed={c.thv_confirmed}
              />
            ) : null}
            {book && book.source === 'case' && canDraft(permissions, domain.code) ? (
              <DmsAttributesForm
                url={`/api/dms/cases/${c.id}/draft`}
                columns={inputColumns(book)}
                current={c.attributes}
                fixed={{ title: c.title }}
                legend={`Nội dung vào sổ ${book.code}`}
              />
            ) : null}
            {canDraft(permissions, domain.code)
              ? (CONTRACT_CARDS[domain.code] ?? []).map((card) => (
                  <DmsAttributesForm
                    key={card.title}
                    url={`/api/dms/cases/${c.id}/draft`}
                    columns={card.cols}
                    current={c.attributes}
                    fixed={{ title: c.title }}
                    legend={card.title}
                  />
                ))
              : null}
            <p className="muted mt-2 text-xs">
              Trước khi lưu còn sửa được; sau khi xác nhận lưu chính thức, mọi thay đổi phải thông
              qua yêu cầu sửa đổi.
            </p>
          </section>
          <section aria-labelledby="sec-b" className="rounded-2xl bg-surface p-5 shadow-sm">
            <h2 id="sec-b">
              {domain.code === 'tongdat'
                ? 'Phụ lục: giấy tờ cần tống đạt (mỗi giấy tờ là một dòng Sổ S-01)'
                : domain.code === 'tochuc'
                  ? 'Tài liệu kèm theo'
                  : 'B. Tài liệu đính kèm'}
            </h2>
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
            <p className="mt-3">
              <Button asChild variant="secondary">
                <Link className="no-underline" href={`${base}?tab=tai-lieu`}>
                  + Thêm tài liệu
                </Link>
              </Button>
            </p>
          </section>
          <section aria-labelledby="sec-c" className="rounded-2xl bg-surface p-5 shadow-sm">
            <h2 id="sec-c">C. Thông tin hệ thống — tự động</h2>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="muted">Người tạo</dt>
                <dd>{creatorName ?? '—'}</dd>
              </div>
              <div>
                <dt className="muted">Ngày tạo</dt>
                <dd>{fmt.format(new Date(c.created_at))}</dd>
              </div>
              <div>
                <dt className="muted">ID hồ sơ</dt>
                <dd>{c.id.slice(0, 8)}</dd>
              </div>
              <div>
                <dt className="muted">Trạng thái scan</dt>
                <dd>{c.scan_count > 0 ? `${c.scan_count} scan` : 'Chưa có scan'}</dd>
              </div>
              <div>
                <dt className="muted">{domain.code === 'vtden' ? 'Số đến' : 'STT số'}</dt>
                <dd>Cấp khi xác nhận lưu chính thức</dd>
              </div>
            </dl>
          </section>
          <DmsDraftActions
            caseId={c.id}
            canRecord={canConfirm(permissions, domain.code)}
            canCancel={canDraft(permissions, domain.code)}
          />
        </div>
      ) : null}

      {tab === 'chung' && !isDraft ? (
        <>
          <dl className="mb-4">
            <dt>Ngày tạo</dt>
            <dd>{fmt.format(new Date(c.created_at))}</dd>
            <dt>Ghi sổ</dt>
            <dd>{c.recorded_at ? fmt.format(new Date(c.recorded_at)) : '—'}</dd>
            {c.status === 'CANCELLED' ? (
              <>
                <dt>Lý do hủy nháp</dt>
                <dd>{c.cancel_reason}</dd>
              </>
            ) : null}
          </dl>
          {isDraft ? (
            <DmsDraftActions
              caseId={c.id}
              canRecord={canConfirm(permissions, domain.code)}
              canCancel={canDraft(permissions, domain.code)}
            />
          ) : (
            <p className="muted mb-4">
              Hồ sơ đã lưu chính thức không sửa trực tiếp, không xoá. Thay đổi phải qua yêu cầu sửa
              đổi có duyệt.
            </p>
          )}
          {isDraft && canDraft(permissions, domain.code) && !isVanThu(domain.code) ? (
            <DmsThvPicker
              caseId={c.id}
              options={thvOptions}
              currentId={c.thv_user_id}
              confirmed={c.thv_confirmed}
            />
          ) : null}
          {isDraft && book && book.source === 'case' && canDraft(permissions, domain.code) ? (
            <DmsAttributesForm
              url={`/api/dms/cases/${c.id}/draft`}
              columns={inputColumns(book)}
              current={c.attributes}
              fixed={{ title: c.title }}
              legend={`Nội dung vào sổ ${book.code}`}
            />
          ) : null}
          {!isDraft && book && book.source === 'case' ? (
            <dl className="mb-4" aria-label={`Nội dung sổ ${book.code}`}>
              {inputColumns(book).map((col) => (
                <div key={col.key}>
                  <dt>{col.heading}</dt>
                  <dd>{String(c.attributes[col.key] ?? '') || '—'}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </>
      ) : null}

      {tab === 'tai-lieu' ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            {isDraft && canAddDocument(permissions, domain.code) ? (
              <AddDmsDocumentForm caseId={c.id} />
            ) : null}
            {docs.length === 0 ? (
              <div className="state" role="status">
                <h3>Chưa có tài liệu</h3>
              </div>
            ) : (
              docs.map((d, i) => (
                <article key={d.id} className="mb-4" aria-label={d.title}>
                  <h3>
                    {d.title}{' '}
                    <span className="muted">
                      ({d.kind}
                      {d.is_official ? ' · chính thức' : ''})
                    </span>
                  </h3>
                  {filesByDoc[i]!.length === 0 ? (
                    <p className="muted">Chưa có tệp.</p>
                  ) : (
                    <ul>
                      {filesByDoc[i]!.map((f) => (
                        <li key={f.id} className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="min-w-0 flex-1">
                            {f.label} · v{f.version} · {sizeLabel(f.size_bytes)}
                          </span>
                          <span
                            className={
                              f.is_scan
                                ? 'rounded-full bg-[#d9f1e2] px-2.5 py-0.5 text-xs font-semibold text-[#1b6b3a]'
                                : 'rounded-full bg-[#eef1f6] px-2.5 py-0.5 text-xs font-semibold text-muted'
                            }
                          >
                            {f.is_scan ? 'Bản scan' : 'Bổ sung'}
                          </span>
                          <Button asChild variant="secondary">
                            <Link
                              className="no-underline"
                              href={`${base}?tab=tai-lieu&file=${f.id}`}
                            >
                              Xem
                            </Link>
                          </Button>
                          <a href={`/api/dms/files/${f.id}/download`} download>
                            Tải
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {isDraft &&
                  book &&
                  book.source === 'document' &&
                  canDraft(permissions, domain.code) ? (
                    <DmsAttributesForm
                      url={`/api/dms/documents/${d.id}/draft`}
                      columns={inputColumns(book)}
                      current={d.attributes}
                      fixed={{ kind: d.kind, title: d.title, isOfficial: d.is_official }}
                      legend={`Giấy tờ vào sổ ${book.code}`}
                    />
                  ) : null}
                  {c.status !== 'CANCELLED' ? <UploadDmsFile documentId={d.id} /> : null}
                </article>
              ))
            )}
          </div>
          <aside aria-label="Xem trước tệp">
            {preview ? (
              <>
                <iframe
                  title={`Xem trước ${preview.label}`}
                  src={`/api/dms/files/${preview.id}/download?inline=1`}
                  className="h-[560px] w-full rounded-2xl border border-line bg-surface"
                />
                <p className="muted mt-2">Xem trước · {preview.label}</p>
                <p className="mt-2 flex flex-wrap items-center gap-2">
                  <Button asChild>
                    <a href={`/api/dms/files/${preview.id}/download`} download>
                      Tải bản scan chính
                    </a>
                  </Button>
                  <Button asChild variant="secondary">
                    <a
                      href={`/api/dms/files/${preview.id}/download?inline=1`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      In
                    </a>
                  </Button>
                  {c.status === 'RECORDED' ? (
                    <Button asChild variant="secondary">
                      <Link href={`${base}?tab=sua-doi`}>Tạo yêu cầu sửa đổi</Link>
                    </Button>
                  ) : null}
                </p>
                <p className="muted">Không có nút xóa hồ sơ, xóa tài liệu hay ghi đè tệp.</p>
              </>
            ) : (
              <div className="state" role="status">
                <h3>Chọn một tệp để xem trước</h3>
              </div>
            )}
          </aside>
        </div>
      ) : null}

      {tab === 'phien-ban' ? (
        <section aria-labelledby="rev-title" className="mb-5 grid gap-3">
          <h2 id="rev-title">Phiên bản dữ liệu</h2>
          {revisions.length <= 1 ? (
            <p className="muted">
              Hồ sơ chưa có bản sửa đổi nào. Bản gốc giữ nguyên; mỗi sửa đổi được duyệt sẽ thêm một
              phiên bản và bản cũ vẫn được giữ.
            </p>
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
          {pairs.map((pr) => (
            <article key={pr.newer.id} className="rounded-2xl bg-surface p-5 shadow-sm">
              <h3>
                So sánh tệp {pr.newer.label}: v{pr.older.version} và v{pr.newer.version}
              </h3>
              <div className="grid gap-3 lg:grid-cols-2">
                {[pr.older, pr.newer].map((f) => (
                  <figure key={f.id} className="m-0">
                    <iframe
                      title={`Tệp ${f.label} v${f.version}`}
                      src={`/api/dms/files/${f.id}/download?inline=1`}
                      className="h-[420px] w-full rounded-xl border border-line bg-surface"
                    />
                    <figcaption className="muted text-xs">
                      v{f.version} · {f.label} · {sizeLabel(f.size_bytes)}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {tab === 'scan' || tab === 'phien-ban' ? (
        <>
          <p className="muted">
            {tab === 'scan'
              ? `Bản scan = ảnh/PDF của giấy tờ gốc (${scanFileCount} tệp).`
              : `Mọi phiên bản tệp của hồ sơ (${fileCount}); bản cũ được giữ, không ghi đè.`}
          </p>
          {(tab === 'scan' ? scanFileCount : fileCount) === 0 ? (
            <div className="state" role="status">
              <h3>Chưa có tệp</h3>
            </div>
          ) : (
            <DataTable tableKey="dms-domain-id-page-1">
              <table>
                <caption className="sr-only">
                  {tab === 'scan' ? 'Bản scan của hồ sơ' : 'Phiên bản tệp của hồ sơ'}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Tệp</th>
                    <th scope="col">Tài liệu</th>
                    <th scope="col">Loại</th>
                    <th scope="col">Phiên bản</th>
                    <th scope="col">Dung lượng</th>
                    <th scope="col">Tải</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.flatMap((d, i) =>
                    filesByDoc[i]!.filter((f) => tab === 'phien-ban' || f.is_scan).map((f) => (
                      <tr key={f.id}>
                        <th scope="row">{f.label}</th>
                        <td>{d.title}</td>
                        <td>{f.is_scan ? 'Bản scan' : 'Tệp'}</td>
                        <td>v{f.version}</td>
                        <td>{sizeLabel(f.size_bytes)}</td>
                        <td>
                          <a href={`/api/dms/files/${f.id}/download`} download>
                            Tải
                          </a>
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </DataTable>
          )}
        </>
      ) : null}

      {tab === 'sua-doi' ? (
        <>
          {canAmend && book && book.source === 'case' ? (
            <DmsAmendmentForm
              caseId={c.id}
              columns={inputColumns(book)}
              current={c.attributes}
              currentTitle={c.title}
              allowN11={domain.code === 'vibang'}
            />
          ) : null}
          {canAmend
            ? docs.map((d, i) => (
                <div key={d.id}>
                  {[...new Set(filesByDoc[i]!.map((f) => f.id))].map((fid) => (
                    <DmsFileVersionForm key={fid} caseId={c.id} documentId={d.id} fileId={fid} />
                  ))}
                  {book && book.source === 'document' ? (
                    <DmsAmendmentForm
                      caseId={c.id}
                      documentId={d.id}
                      columns={inputColumns(book)}
                      current={d.attributes}
                      allowN11={false}
                    />
                  ) : null}
                </div>
              ))
            : null}
          {c.status !== 'RECORDED' ? (
            <p className="muted">Chỉ hồ sơ đã lưu chính thức mới có yêu cầu sửa đổi.</p>
          ) : null}
          {amendments !== 'error' && amendments.length > 0 ? (
            <>
              <h2>Lịch sử sửa đổi</h2>
              <ul>
                {amendments.map((a) => (
                  <li key={a.id}>
                    {fmt.format(new Date(a.requested_at))} ·{' '}
                    <span
                      className="chip"
                      data-tone={
                        a.status === 'APPROVED' ? 'ok' : a.status === 'PENDING' ? 'warn' : 'danger'
                      }
                    >
                      {AMENDMENT_STATUS_LABEL[a.status]}
                    </span>{' '}
                    {a.n11 ? '(N-11) ' : ''}
                    {amendmentSummary(a)} — {a.reason}{' '}
                    <a href={`/api/dms/amendments/${a.id}/evidence`}>Văn bản sửa đổi</a>
                    {a.auto_via === 'WINDOW' ? ' · tự duyệt (quy tắc cũ đã bỏ)' : ''}
                    {a.review_note ? ` · ${a.review_note}` : ''}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
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
