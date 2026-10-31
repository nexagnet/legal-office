import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DmsAttributesForm } from '../../../../components/DmsAttributesForm';
import {
  AddDmsDocumentForm,
  DmsDraftActions,
  UploadDmsFile,
} from '../../../../components/DmsCaseActions';
import {
  canAddDocument,
  canConfirm,
  canDraft,
  domainBySlug,
  inputColumns,
  loadDmsBooks,
  loadDmsCase,
  loadDmsDocuments,
  loadDmsFiles,
  loadMyDmsPermissions,
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

export default async function DmsCasePage({
  params,
}: {
  params: Promise<{ domain: string; id: string }>;
}) {
  const { domain: slug, id } = await params;
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
  const [documents, permissions, books] = await Promise.all([
    loadDmsDocuments(cookie, id),
    loadMyDmsPermissions(cookie, c.office_id),
    loadDmsBooks(cookie),
  ]);
  const book = books === 'error' ? undefined : books.find((b) => b.domain === domain.code);
  const docs = documents === 'error' ? [] : documents;
  const filesByDoc = await Promise.all(docs.map((d) => loadDmsFiles(cookie, d.id)));
  const isDraft = c.status === 'DRAFT';
  const mine = isDraft; // bản nháp chỉ người tạo thấy (DB đã lọc); nút còn lại do DB kiểm quyền lần nữa
  return (
    <section aria-labelledby="t">
      <p>
        <Link
          href={`/dms/${domain.slug}${isDraft ? '?tab=nhap' : c.status === 'CANCELLED' ? '?tab=da-huy' : ''}`}
        >
          ← {domain.label}
        </Link>
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
      {mine ? (
        <DmsDraftActions
          caseId={c.id}
          canRecord={canConfirm(permissions, domain.code)}
          canCancel={canDraft(permissions, domain.code)}
        />
      ) : (
        <p className="muted mb-4">
          Hồ sơ đã lưu chính thức không sửa trực tiếp, không xoá. Thay đổi phải qua yêu cầu sửa đổi
          có duyệt.
        </p>
      )}
      {isDraft && book && book.source === 'case' && canDraft(permissions, domain.code) ? (
        <DmsAttributesForm
          url={`/api/dms/cases/${c.id}/draft`}
          columns={inputColumns(book)}
          current={c.attributes}
          fixed={{ title: c.title }}
          legend={`Nội dung vào sổ ${book.code}`}
        />
      ) : null}
      {isDraft && canAddDocument(permissions, domain.code) ? (
        <AddDmsDocumentForm caseId={c.id} />
      ) : null}
      <h2>Tài liệu</h2>
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
                    <a href={`/api/dms/files/${f.id}/download`}>{f.label}</a> ·{' '}
                    {f.is_scan ? 'bản scan' : 'tệp'} · v{f.version} · {sizeLabel(f.size_bytes)}
                  </li>
                ))}
              </ul>
            )}
            {isDraft && book && book.source === 'document' && canDraft(permissions, domain.code) ? (
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
    </section>
  );
}
