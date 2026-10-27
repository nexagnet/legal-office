import Link from 'next/link';
import { FilterChips } from '../../../../components/ui/filter-chips';
import { getJson } from '../../../../lib/case-api';
import { renderCaseFrame } from '../case-frame';

export const dynamic = 'force-dynamic';

interface Doc {
  readonly id: string;
  readonly kind: string;
  readonly version: number;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
}
interface Documents {
  readonly items: readonly Doc[];
  readonly signature: { readonly confirmedAt: string | null };
  readonly stamp: { readonly confirmedAt: string | null };
  readonly finalScan?: { readonly documentId: string; readonly lockedAt: string | null } | null;
}

const ALL = 'tat-ca';
const fmt = (iso: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(iso));
const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ loai?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  return renderCaseFrame(id, 'tai-lieu', async ({ c, base, cookie }) => {
    const d = await getJson<Documents>(`/vibang/cases/${encodeURIComponent(id)}/documents`, cookie);
    if (typeof d !== 'object') {
      return (
        <div className="state" role="alert">
          <h2>Không tải được tài liệu</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      );
    }
    const kinds = [...new Set(d.items.map((x) => x.kind))];
    const active = kinds.includes(sp.loai ?? '') ? (sp.loai as string) : ALL;
    const shown = active === ALL ? d.items : d.items.filter((x) => x.kind === active);
    const marks: [string, string | null][] = [
      ['Chữ ký', d.signature.confirmedAt],
      ['Đóng dấu', d.stamp.confirmedAt],
      ['Bản scan cuối', d.finalScan?.lockedAt ?? null],
    ];
    return (
      <section className="panel" aria-labelledby="docs-t">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="docs-t" className="!m-0">
            Tài liệu hồ sơ
          </h2>
          <Link className="primary btn-link" href={`${base}/ky-dong-dau`}>
            Tải lên / Kiểm tra bản scan
          </Link>
        </div>
        <ul className="m-0 mb-4 flex list-none flex-wrap gap-2 p-0" aria-label="Xác nhận của hồ sơ">
          {marks.map(([label, at]) => (
            <li key={label} className="pill" data-tone={at ? 'ok' : 'idle'}>
              {label}: {at ? fmt(at) : 'chưa xác nhận'}
            </li>
          ))}
        </ul>
        {kinds.length > 1 ? (
          <div className="mb-4">
            <FilterChips
              label="Loại tài liệu"
              active={active}
              chips={[
                { key: ALL, label: 'Tất cả', href: `${base}/tai-lieu`, count: d.items.length },
                ...kinds.map((k) => ({
                  key: k,
                  label: k,
                  href: `${base}/tai-lieu?loai=${encodeURIComponent(k)}`,
                  count: d.items.filter((x) => x.kind === k).length,
                })),
              ]}
            />
          </div>
        ) : null}
        {shown.length === 0 ? (
          <p className="muted">Hồ sơ {c.title} chưa có tài liệu nào.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Tài liệu của hồ sơ</caption>
              <thead>
                <tr>
                  <th scope="col">Loại</th>
                  <th scope="col">Phiên bản</th>
                  <th scope="col">Dung lượng</th>
                  <th scope="col">Mã SHA-256</th>
                  <th scope="col">Ngày tải</th>
                  <th scope="col">
                    <span className="sr-only">Tải tệp</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((x) => (
                  <tr key={x.id}>
                    <th scope="row">{x.kind}</th>
                    <td>{x.version}</td>
                    <td>{kb(x.sizeBytes)}</td>
                    <td className="text-muted">{x.sha256.slice(0, 12)}…</td>
                    <td>{fmt(x.createdAt)}</td>
                    <td>
                      <a href={`/api/vibang/cases/${c.id}/documents/${x.id}/file`}>Tải tệp</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  });
}
