import type { CSSProperties } from 'react';

/** Khung chờ giữ đúng bố cục thật (Figma N14 khung B): cùng lưới, cùng chiều cao hàng, nên không nhảy layout khi dữ liệu về. */

const bar = (w: number | string, h = 12): CSSProperties => ({ width: w, height: h });

function Bar({ w, h }: { readonly w: number | string; readonly h?: number }) {
  return <span className="sk" style={bar(w, h)} aria-hidden="true" />;
}

function Frame({
  children,
  label,
}: {
  readonly children: React.ReactNode;
  readonly label: string;
}) {
  return (
    <section className="sk-root" aria-busy="true">
      <p className="sr-only" role="status">
        {label}
      </p>
      {children}
    </section>
  );
}

function KpiSkeleton({ count }: { readonly count: number }) {
  return (
    <div className="kpi-strip" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="kpi">
          <Bar w="60%" h={13} />
          <div style={{ marginTop: 10 }}>
            <Bar w={64} h={30} />
          </div>
        </div>
      ))}
    </div>
  );
}

const CELL_WIDTHS = [90, 160, 110, 80, 130, 150, 90] as const;

function TableSkeleton({ rows, cols }: { readonly rows: number; readonly cols: number }) {
  return (
    <div className="table-wrap" aria-hidden="true">
      <table>
        <thead>
          <tr>
            {Array.from({ length: cols }, (_, c) => (
              <th key={c} scope="col">
                <Bar w={CELL_WIDTHS[c % CELL_WIDTHS.length]! * 0.7} h={11} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }, (_, c) => (
                <td key={c}>
                  <Bar w={CELL_WIDTHS[(c + r) % CELL_WIDTHS.length]!} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Trang danh sách: tiêu đề thật hiện ngay, số liệu và bảng là khung chờ. */
export function ListSkeleton({
  title,
  kpis = 4,
  rows = 8,
  cols = 6,
}: {
  readonly title: string;
  readonly kpis?: number;
  readonly rows?: number;
  readonly cols?: number;
}) {
  return (
    <Frame label="Đang tải danh sách…">
      <div className="page-head">
        <h1>{title}</h1>
      </div>
      <KpiSkeleton count={kpis} />
      <TableSkeleton rows={rows} cols={cols} />
    </Frame>
  );
}

/** Chi tiết hồ sơ: banner, tiến độ sáu bước và hai cột thông tin. */
export function DetailSkeleton() {
  return (
    <Frame label="Đang tải hồ sơ…">
      <div className="sk-banner" aria-hidden="true">
        <Bar w={120} h={12} />
        <Bar w={220} h={24} />
      </div>
      <div className="sk-steps" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="sk-step">
            <span className="sk sk-dot" />
            <Bar w={90} h={10} />
          </div>
        ))}
      </div>
      <div className="sk-cols" aria-hidden="true">
        {[0, 1].map((c) => (
          <div key={c} className="sk-card">
            {Array.from({ length: 6 }, (_, r) => (
              <div key={r} className="sk-line">
                <Bar w={90} h={10} />
                <Bar w={`${55 + ((r * 13) % 35)}%`} h={14} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** Tổng quan theo khối: thẻ số liệu, hàng việc, hoạt động địa điểm. */
export function DashboardSkeleton() {
  return (
    <Frame label="Đang tải tổng quan…">
      <div className="page-head">
        <h1>Tổng quan</h1>
      </div>
      <KpiSkeleton count={4} />
      <div className="sk-cols" aria-hidden="true">
        <div className="sk-card">
          {Array.from({ length: 5 }, (_, r) => (
            <div key={r} className="sk-line">
              <Bar w="70%" h={14} />
              <Bar w="40%" h={10} />
            </div>
          ))}
        </div>
        <div className="sk-card">
          {Array.from({ length: 5 }, (_, r) => (
            <div key={r} className="sk-line">
              <Bar w={`${90 - r * 12}%`} h={14} />
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}
