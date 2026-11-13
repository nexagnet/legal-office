import { FileText, Image as ImageIcon, Upload } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { DmsFileRow } from '../lib/dms';
import { cn } from '../lib/cn';
import { OTHER_KIND } from '../lib/dms-other-kind';
import { FileActions, UploadButton, type CompareFile, type UploadTarget } from './DmsFileActions';
import { ocrApplies } from '../lib/ocr-progress';
import { OcrProgress } from './OcrProgress';

const dateFmt = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
});
const sizeLabel = (n: number | string) => `${Math.max(1, Math.round(Number(n) / 1024))} KB`;

export interface DocGroup {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly isOfficial: boolean;
  readonly files: readonly DmsFileRow[];
  /** Nút "Sửa thông tin (Admin)" của tài liệu đã ghi sổ. */
  readonly adminEdit?: ReactNode;
}

const toCompare = (f: DmsFileRow): CompareFile => ({
  id: f.id,
  label: f.label,
  version: f.version,
  sizeKb: sizeLabel(f.size_bytes),
  date: dateFmt.format(new Date(f.created_at)),
});

/** Nhãn nhóm không lặp chữ: "Tài liệu khác (Tài liệu khác)" cũ thành "Tài liệu khác · không vào sổ". */
export function groupLabel(g: Pick<DocGroup, 'title' | 'kind' | 'isOfficial'>): string {
  if (g.kind === OTHER_KIND) return 'Tài liệu khác · không vào sổ';
  const name = g.title === g.kind || !g.kind ? g.title : `${g.title} · ${g.kind}`;
  return g.isOfficial ? `${name} · chính thức` : name;
}

/** Phiên bản liền trước của tệp trong cùng tài liệu (cùng nhãn, version nhỏ hơn gần nhất). */
function olderOf(f: DmsFileRow, list: readonly DmsFileRow[]): CompareFile | null {
  const prev = list
    .filter((x) => x.label === f.label && x.version < f.version)
    .sort((a, b) => b.version - a.version)[0];
  return prev ? toCompare(prev) : null;
}

function ocrChip(f: DmsFileRow, canRetry: boolean): ReactNode {
  return ocrApplies(f.mime) ? (
    <OcrProgress
      fileId={f.id}
      canRetry={canRetry}
      initial={{
        status: f.ocr_status ?? null,
        done: f.ocr_pages_done ?? null,
        total: f.ocr_pages_total ?? null,
      }}
    />
  ) : null;
}

/**
 * Tab "Tài liệu" của chi tiết hồ sơ (Figma T1–T4, dùng chung 4 nghiệp vụ): danh sách một cột gọn bên trái, xem trước bên phải.
 * Một nút "Tải lên" duy nhất; mỗi tệp một dòng (bấm dòng để xem), "Tải" là hành động chính, hành động phụ nằm trong menu ⋯.
 */
export function DmsDocumentsTab({
  caseId,
  base,
  groups,
  previewId,
  canUpload,
  canAddScan,
  canDeleteScan,
}: {
  readonly caseId: string;
  readonly base: string;
  readonly groups: readonly DocGroup[];
  readonly previewId?: string;
  /** Được tải vào "Tài liệu khác" (không áp dụng cho hồ sơ hủy / Văn thư). */
  readonly canUpload: boolean;
  /** Hồ sơ chưa hủy: được tải thêm scan cho tài liệu có sẵn. */
  readonly canAddScan: boolean;
  readonly canDeleteScan: boolean;
}) {
  const real = groups.filter((g) => g.kind !== OTHER_KIND);
  const targets: UploadTarget[] = canAddScan
    ? real.map((g) => ({ id: g.id, label: groupLabel(g) }))
    : [];
  const canPickTarget = canUpload || targets.length > 0;
  const all = groups.flatMap((g) => g.files.map((f) => ({ f, g })));
  const current = all.find((x) => x.f.id === previewId) ?? all.find((x) => x.f.is_scan) ?? all[0];
  const fileCount = all.length;
  const shown = groups.filter((g) => g.files.length > 0 || g.adminEdit);
  const actionsFor = (f: DmsFileRow, g: DocGroup, variant: 'row' | 'preview') => {
    const isOther = g.kind === OTHER_KIND;
    return (
      <FileActions
        caseId={caseId}
        file={{ ...toCompare(f), isScan: f.is_scan }}
        documentId={isOther ? 'other' : g.id}
        targets={targets}
        allowOther={canUpload}
        canAddScan={isOther ? canUpload : canAddScan}
        canDelete={canDeleteScan && f.is_scan}
        older={olderOf(f, g.files)}
        variant={variant}
      />
    );
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,540px)_minmax(0,1fr)]">
      <div className="grid content-start gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-base font-semibold">Tài liệu của hồ sơ</h2>
            <p className="m-0 text-xs text-muted">
              {fileCount === 0 ? 'Chưa có tệp' : `${shown.length} nhóm · ${fileCount} tệp`}
            </p>
          </div>
          {fileCount > 0 && canPickTarget ? (
            <UploadButton caseId={caseId} targets={targets} allowOther={canUpload} />
          ) : null}
        </div>

        {fileCount === 0 ? (
          <div
            role="status"
            className="grid justify-items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center"
          >
            <span className="grid size-14 place-items-center rounded-full bg-accent-soft text-accent">
              <Upload size={24} aria-hidden="true" />
            </span>
            <h3 className="m-0 text-base font-semibold">Chưa có tài liệu nào</h3>
            <p className="m-0 max-w-xs text-sm text-muted">
              {canPickTarget
                ? 'Kéo thả tệp vào hộp thoại Tải lên. Hỗ trợ PDF, JPEG, PNG; không giới hạn số tệp.'
                : 'Hồ sơ này chưa có tệp nào.'}
            </p>
            {canPickTarget ? (
              <UploadButton caseId={caseId} targets={targets} allowOther={canUpload} />
            ) : null}
          </div>
        ) : (
          shown.map((g) => (
            <section key={g.id} aria-label={groupLabel(g)} className="grid gap-2">
              <div className="flex items-center justify-between gap-2 px-0.5">
                <h3 className="m-0 text-[11px] font-semibold tracking-wide text-muted uppercase">
                  {groupLabel(g)}
                </h3>
                {g.adminEdit}
              </div>
              {g.files.length === 0 ? (
                <p className="m-0 rounded-xl bg-surface px-3 py-3 text-sm text-muted shadow-sm">
                  Chưa có tệp.
                </p>
              ) : (
                g.files.map((f) => {
                  const selected = current?.f.id === f.id;
                  return (
                    <div
                      key={f.id}
                      className={cn(
                        'relative flex items-center gap-3 rounded-xl border p-3 shadow-sm',
                        selected
                          ? 'border-accent bg-accent-soft/50'
                          : 'border-line bg-surface hover:bg-surface-2',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'grid size-9 shrink-0 place-items-center rounded-lg',
                          selected ? 'bg-surface text-accent' : 'bg-head text-muted',
                        )}
                      >
                        {f.mime.startsWith('image/') ? (
                          <ImageIcon size={18} />
                        ) : (
                          <FileText size={18} />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`${base}?tab=tai-lieu&file=${f.id}`}
                          aria-current={selected ? 'true' : undefined}
                          className="block truncate text-sm font-semibold text-ink no-underline after:absolute after:inset-0 after:content-['']"
                        >
                          {f.label}
                        </Link>
                        <p className="m-0 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                          <span>
                            {sizeLabel(f.size_bytes)} · v{f.version} ·{' '}
                            {dateFmt.format(new Date(f.created_at))}
                          </span>
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                              f.is_scan ? 'bg-accent-soft text-accent' : 'bg-head text-muted',
                            )}
                          >
                            {f.is_scan ? 'Bản scan' : 'Bổ sung'}
                          </span>
                          {ocrChip(f, canUpload || canAddScan)}
                        </p>
                      </div>
                      {actionsFor(f, g, 'row')}
                    </div>
                  );
                })
              )}
            </section>
          ))
        )}
      </div>

      <aside aria-label="Xem trước tệp">
        {current ? (
          <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-sm font-semibold">{current.f.label}</p>
                <p className="m-0 text-xs text-muted">
                  {current.f.is_scan ? 'Bản scan' : 'Bổ sung'} · v{current.f.version} ·{' '}
                  {sizeLabel(current.f.size_bytes)}
                </p>
              </div>
              {actionsFor(current.f, current.g, 'preview')}
            </div>
            <iframe
              title={`Xem trước ${current.f.label}`}
              src={`/api/dms/files/${current.f.id}/download?inline=1`}
              className="h-[520px] w-full border-0 bg-surface-2"
            />
          </div>
        ) : (
          <div
            role="status"
            className="grid min-h-[320px] place-items-center rounded-xl border border-dashed border-line-strong bg-surface text-sm text-muted"
          >
            Chọn một tệp để xem trước
          </div>
        )}
      </aside>
    </div>
  );
}
