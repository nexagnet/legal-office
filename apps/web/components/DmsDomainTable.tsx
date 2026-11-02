import Link from 'next/link';
import type { ReactNode } from 'react';
import type { DmsBookRow, DmsBookSpec } from '../lib/dms';
import { scanState } from '../lib/dms';
import type { DmsSearchCase } from '../lib/dms-browse';
import { bookGetter, type ListColumn } from '../lib/dms-list-layout';
import { DataTable } from './ui/data-table';

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
}: {
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
      <table className="dms-table" style={{ minWidth: total }}>
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          {layout.map((c) => (
            <col key={c.id} style={{ width: c.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {layout.map((c) => (
              <th key={c.id} scope="col">
                {c.special === 'stt' ? `${sttLabel} · Mã hồ sơ` : c.head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const bookRows = byCase.get(r.id) ?? [];
            const get = spec ? bookGetter(spec, bookRows[0]) : () => '';
            const scan = scanState(r);
            const cells: ReactNode[] = layout.map((c) => {
              if (c.special === 'stt')
                return (
                  <th key={c.id} scope="row" className="dms-stt">
                    <b>
                      {sttLabel} {bookRows[0]?.stt ?? '—'}
                    </b>
                    <Link href={`${basePath}/${r.id}`} className="dms-code">
                      {r.title}
                    </Link>
                    {r.pending_count > 0 ? (
                      <span className="dms-pill" data-tone="warn">
                        Chờ duyệt sửa đổi
                      </span>
                    ) : null}
                  </th>
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
                          Upload scan
                        </Link>
                      )}
                    </span>
                  </td>
                );
              const v = c.cell?.(get) ?? { primary: '' };
              return (
                <td key={c.id}>
                  <Clamp>{v.primary}</Clamp>
                  <Clamp muted>{v.secondary ?? ''}</Clamp>
                </td>
              );
            });
            return <tr key={r.id}>{cells}</tr>;
          })}
        </tbody>
      </table>
    </DataTable>
  );
}
