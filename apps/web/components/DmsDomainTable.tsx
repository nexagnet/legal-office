import Link from 'next/link';
import type { ReactNode } from 'react';
import type { DmsBookRow, DmsBookSpec } from '../lib/dms';
import { scanState } from '../lib/dms';
import type { DmsSearchCase } from '../lib/dms-browse';
import { bookGetter, EXPANDABLE_DOMAINS, sttRange, type ListColumn } from '../lib/dms-list-layout';
import { DmsRowToggle } from './DmsRowToggle';
import { DataTable } from './ui/data-table';

const headOf = (c: ListColumn, sttLabel: string): ReactNode =>
  c.special === 'stt' ? (
    `${sttLabel} · Mã hồ sơ`
  ) : c.special === 'number' ? (
    <>
      {c.head}
      <small className="dms-th-sub">tự động</small>
    </>
  ) : (
    c.head
  );

/** Gộp các cột liên tiếp cùng `group` thành một ô tiêu đề; cột lẻ giữ nguyên. */
function groupCells(layout: readonly ListColumn[]) {
  const out: { label: string | null; cols: ListColumn[] }[] = [];
  for (const c of layout) {
    const last = out[out.length - 1];
    if (c.group && last && last.label === c.group) last.cols.push(c);
    else out.push({ label: c.group ?? null, cols: [c] });
  }
  return out;
}

const shortDate = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
});

const Clamp = ({ children, muted = false }: { children: string; muted?: boolean }) =>
  children ? (
    <span className={muted ? 'dms-clamp dms-sub' : 'dms-clamp'} title={children}>
      {children}
    </span>
  ) : null;

function ScanCell({ row }: { readonly row: DmsSearchCase }) {
  const scan = scanState(row);
  return (
    <span className="dms-scan">
      <span className="dms-pill" data-tone="info">
        {row.document_count} tài liệu
      </span>
      {scan === 'no-documents' ? (
        <span className="dms-pill" data-tone="danger">
          Chưa có tài liệu
        </span>
      ) : scan === 'missing' ? (
        <>
          <span className="dms-pill" data-tone="danger">
            Thiếu scan
          </span>
          <small>{row.scan_count} file</small>
        </>
      ) : (
        <>
          <span className="dms-pill" data-tone="ok">
            {row.scan_count} file
          </span>
          <small>đủ scan</small>
        </>
      )}
    </span>
  );
}

/**
 * Bảng danh sách bốn nghiệp vụ theo Figma "DMS v2": mỗi hồ sơ một hàng, cột theo `layout`
 * (STT · mã hồ sơ, các cột sổ cốt lõi, Tài liệu · Bản scan, Xem · Tải scan). Không bỏ cột: màn hẹp cuộn ngang
 * với cột đầu và cột thao tác cố định (DataTable).
 */
export function DmsDomainTable({
  rows,
  caption,
  basePath,
  layout,
  spec,
  byCase,
  sttLabel,
  tableKey,
  draft,
}: {
  /** Chế độ Nháp / Đã hủy (Figma 420:1420): chưa có STT, không có dòng sổ, thao tác riêng. */
  readonly draft?: { readonly kind: 'nhap' | 'da-huy'; readonly userId: string | undefined };
  readonly rows: readonly DmsSearchCase[];
  readonly caption: string;
  readonly basePath: string;
  readonly layout: readonly ListColumn[];
  readonly spec: DmsBookSpec | undefined;
  readonly byCase: ReadonlyMap<string, readonly DmsBookRow[]>;
  readonly sttLabel: string;
  readonly tableKey: string;
}) {
  const total = layout.reduce((n, c) => n + c.width, 0);
  return (
    <DataTable tableKey={tableKey} className="dms-table-wrap">
      <table className="dms-table" style={{ '--dms-min': `${total}px` } as React.CSSProperties}>
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          {layout.map((c) => (
            <col key={c.id} style={{ width: c.width }} />
          ))}
        </colgroup>
        <thead>
          {layout.some((c) => c.group) ? (
            <>
              <tr>
                {groupCells(layout).map((g) =>
                  g.cols.length === 1 && !g.label ? (
                    <th key={g.cols[0]!.id} scope="col" rowSpan={2}>
                      {headOf(g.cols[0]!, sttLabel)}
                    </th>
                  ) : (
                    <th key={g.cols[0]!.id} scope="colgroup" colSpan={g.cols.length}>
                      {g.label}
                    </th>
                  ),
                )}
              </tr>
              <tr>
                {layout
                  .filter((c) => c.group)
                  .map((c) => (
                    <th key={c.id} scope="col">
                      {c.head}
                    </th>
                  ))}
              </tr>
            </>
          ) : (
            <tr>
              {layout.map((c) => (
                <th key={c.id} scope="col">
                  {headOf(c, sttLabel)}
                </th>
              ))}
            </tr>
          )}
        </thead>
        {rows.map((r) => {
          const bookRows = byCase.get(r.id) ?? [];
          // Nháp chưa có dòng sổ: lấy thông tin người dùng đã nhập tạm trên hồ sơ (thuộc tính hồ sơ).
          const attr = (key: string): string => {
            const v = r.attributes[key];
            return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
          };
          const getters = draft ? [attr] : spec ? bookRows.map((br) => bookGetter(spec, br)) : [];
          const get = getters[0] ?? (() => '');
          const scan = scanState(r);
          const mine = draft ? r.created_by === draft.userId : false;
          const expandable = EXPANDABLE_DOMAINS.has(r.domain) && bookRows.length > 1;
          const cells: ReactNode[] = layout.map((c) => {
            if (c.special === 'stt' && draft)
              return (
                <th key={c.id} scope="row" className="dms-stt">
                  <span className="dms-stt-in">
                    <b>Chưa có {sttLabel}</b>
                    <Link href={`${basePath}/${r.id}`} className="dms-code">
                      {draft.kind === 'da-huy' ? 'Đã hủy' : 'Nháp'} ·{' '}
                      {shortDate.format(new Date(r.created_at))}
                      {r.creator_name ? ` · ${r.creator_name}` : ''}
                    </Link>
                    <span className="dms-draft-tag" data-kind={draft.kind}>
                      {draft.kind === 'da-huy' ? 'Bản nháp đã hủy' : 'Bản nháp'}
                    </span>
                  </span>
                </th>
              );
            if (c.special === 'stt')
              return (
                <th key={c.id} scope="row" className="dms-stt">
                  <span className="dms-stt-in">
                    <b>
                      {sttLabel} {sttRange(bookRows.map((br) => br.stt))}
                    </b>
                    <Link href={`${basePath}/${r.id}`} className="dms-code">
                      {r.title}
                    </Link>
                    {r.pending_count > 0 ? (
                      <span className="dms-pill" data-tone="warn">
                        Chờ duyệt
                      </span>
                    ) : null}
                    {expandable ? (
                      <DmsRowToggle count={bookRows.length} caseTitle={r.title} />
                    ) : null}
                  </span>
                </th>
              );
            if (draft && c.special === 'number')
              return (
                <td key={c.id} className="dms-number">
                  —
                </td>
              );
            if (draft && c.special === 'scan')
              return (
                <td key={c.id}>
                  <span className="dms-scan">
                    <span className="dms-pill" data-tone="info">
                      {r.document_count} tài liệu
                    </span>
                    <span className="dms-pill" data-tone="muted">
                      Chưa ghi sổ
                    </span>
                  </span>
                </td>
              );
            if (draft && c.special === 'actions')
              return (
                <td key={c.id}>
                  <span className="dms-actions dms-actions-draft">
                    {draft.kind === 'da-huy' ? (
                      <Link href={`${basePath}/${r.id}`} className="dms-btn">
                        Xem
                      </Link>
                    ) : mine ? (
                      <>
                        <Link href={`${basePath}/${r.id}`} className="dms-btn dms-btn-lg">
                          Tiếp tục soạn
                        </Link>
                        <Link href={`${basePath}/${r.id}`} className="dms-danger-link">
                          Hủy nháp
                        </Link>
                      </>
                    ) : (
                      <Link href={`${basePath}/${r.id}`} className="dms-pill" data-tone="info">
                        Chỉ xem (được cấp)
                      </Link>
                    )}
                  </span>
                </td>
              );
            if (c.special === 'number')
              return (
                <td key={c.id} className="dms-number">
                  {bookRows[0]?.stt ?? '—'}
                </td>
              );
            if (c.special === 'scanlite')
              return (
                <td key={c.id}>
                  <span className="dms-pill" data-tone={scan === 'ok' ? 'ok' : 'danger'}>
                    {scan === 'ok' ? `${r.scan_count} scan` : 'Chưa có scan'}
                  </span>
                </td>
              );
            if (c.special === 'scan')
              return (
                <td key={c.id}>
                  <ScanCell row={r} />
                </td>
              );
            if (c.special === 'actions')
              return (
                <td key={c.id}>
                  <span className="dms-actions">
                    {scan === 'ok' ? (
                      <>
                        <Link href={`${basePath}/${r.id}`} className="dms-btn">
                          Xem
                        </Link>
                        <Link href={`${basePath}/${r.id}?tab=scan`} className="dms-link">
                          Tải
                        </Link>
                      </>
                    ) : (
                      <Link href={`${basePath}/${r.id}?tab=scan`} className="dms-btn">
                        {layout.some((c) => c.special === 'scanlite') ? 'Upload' : 'Upload scan'}
                      </Link>
                    )}
                  </span>
                </td>
              );
            const v = c.cell?.(get, getters) ?? { primary: '' };
            if (draft)
              return (
                <td key={c.id}>
                  <Clamp>{v.primary || '—'}</Clamp>
                  <Clamp muted>{v.secondary || (v.primary ? '' : '—')}</Clamp>
                </td>
              );
            return (
              <td key={c.id} data-zero={c.tick && v.primary === '0' ? 'true' : undefined}>
                <Clamp>{v.primary}</Clamp>
                <Clamp muted>{v.secondary ?? ''}</Clamp>
              </td>
            );
          });
          return (
            <tbody
              key={r.id}
              data-open={expandable ? 'false' : undefined}
              data-draft={draft ? draft.kind : undefined}
            >
              <tr>{cells}</tr>
              {expandable ? (
                <>
                  <tr className="dms-sub-head">
                    <td colSpan={layout.length}>
                      Các dòng Sổ S-01 của hồ sơ {r.title} (mỗi giấy tờ một dòng sổ)
                    </td>
                  </tr>
                  {bookRows.map((br, i) => {
                    const g = getters[i]!;
                    return (
                      <tr key={`${br.stt}-${br.document_id ?? i}`} className="dms-sub">
                        {layout.map((c) => {
                          if (c.id === 'stt')
                            return (
                              <th key={c.id} scope="row">
                                {sttLabel} {br.stt}
                              </th>
                            );
                          if (c.special) return <td key={c.id} />;
                          const text = c.tick
                            ? g(c.tick)
                              ? '✓'
                              : ''
                            : (c.cell?.(g, [g]).primary ?? '');
                          return (
                            <td key={c.id} className={c.tick ? 'dms-tick' : undefined}>
                              <Clamp>{text}</Clamp>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </>
              ) : null}
            </tbody>
          );
        })}
      </table>
    </DataTable>
  );
}
