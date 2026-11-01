import Link from 'next/link';
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
  domainBySlug,
  isVanThu,
  inputColumns,
  loadDmsBookRows,
  loadDmsBooks,
  loadDmsCase,
  loadDmsDocuments,
  loadDmsFiles,
  loadMyDmsPermissions,
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

const sizeLabel = (n: number | string) => `${Math.max(1, Math.round(Number(n) / 1024))} KB`;

/** Các tab của trang chi tiết (Figma "Vi bằng · Chi tiết hồ sơ"): chọn bằng `?tab=`. */
const TABS = [
  { key: 'chung', label: 'Thông tin chung' },
  { key: 'tai-lieu', label: 'Tài liệu' },
  { key: 'tep', label: 'Tệp đính kèm' },
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
        <div className="state" role="alert">
          <h2>Không tải được hồ sơ</h2>
          <p>Máy chủ chưa trả về hồ sơ. Vui lòng thử lại sau.</p>
        </div>
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
    (canDraft(permissions, domain.code) || permissions.includes('dms.permission.approve'));
  const book = books === 'error' ? undefined : books.find((b) => b.domain === domain.code);
  const docs = documents === 'error' ? [] : documents;
  const filesByDoc = await Promise.all(docs.map((d) => loadDmsFiles(cookie, d.id)));
  const pendingCount =
    amendments === 'error' ? 0 : amendments.filter((a) => a.status === 'PENDING').length;
  const fileCount = filesByDoc.reduce((n, f) => n + f.length, 0);
  const allFiles = filesByDoc.flat();
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
              : t.key === 'tep'
                ? fileCount
                : t.key === 'sua-doi' && amendments !== 'error'
                  ? amendments.length
                  : undefined,
        }))}
      />

      {tab === 'chung' ? (
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
                        <li key={f.id}>
                          {f.label} · {f.is_scan ? 'bản scan' : 'tệp'} · v{f.version} ·{' '}
                          {sizeLabel(f.size_bytes)} ·{' '}
                          <Link href={`${base}?tab=tai-lieu&file=${f.id}`}>Xem</Link> ·{' '}
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

      {tab === 'tep' ? (
        <>
          <p className="muted">
            Tệp đính kèm = số tệp của mọi tài liệu ({fileCount}); tệp scan là bản ảnh/PDF của giấy
            tờ gốc.
          </p>
          {fileCount === 0 ? (
            <div className="state" role="status">
              <h3>Chưa có tệp</h3>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Tệp đính kèm của hồ sơ</caption>
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
                    filesByDoc[i]!.map((f) => (
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
            </div>
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
