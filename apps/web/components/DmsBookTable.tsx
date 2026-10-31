import { bookCell, headerGroups, type DmsBookRow, type DmsBookSpec } from '../lib/dms';

/**
 * Trang ruột của sổ theo đúng mẫu TP-THV: tiêu đề cột và hàng đánh số cột như mẫu chính thức.
 * Ô nào chưa có dữ liệu để trống, không điền hộ. STT do hệ thống cấp lúc ghi sổ.
 */
export function DmsBookTable({
  spec,
  rows,
}: {
  readonly spec: DmsBookSpec;
  readonly rows: readonly DmsBookRow[];
}) {
  const groups = headerGroups(spec.columns);
  const grouped = groups.some((g) => g.label !== null);
  return (
    <div className="table-wrap">
      <table className="book-table">
        <caption className="sr-only">{spec.title}</caption>
        <thead>
          <tr>
            {groups.map((g) =>
              g.label ? (
                <th key={g.cols[0]!.no} scope="colgroup" colSpan={g.span}>
                  {g.label}
                </th>
              ) : (
                <th key={g.cols[0]!.no} scope="col" rowSpan={grouped ? 2 : 1}>
                  {g.cols[0]!.heading}
                </th>
              ),
            )}
          </tr>
          {grouped ? (
            <tr>
              {groups
                .filter((g) => g.label)
                .flatMap((g) => g.cols)
                .map((c) => (
                  <th key={c.no} scope="col">
                    {c.heading}
                  </th>
                ))}
            </tr>
          ) : null}
          <tr aria-label="Số cột">
            {groups.map((g) =>
              g.label ? (
                <th key={g.cols[0]!.no} colSpan={g.span}>
                  {g.cols.map((c) => c.no).join(' · ')}
                </th>
              ) : (
                <th key={g.cols[0]!.no}>{g.cols[0]!.no}</th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={spec.columns.length}>Chưa có dòng nào trong năm này.</td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={`${r.case_id}-${r.document_id ?? ''}`}>
                {spec.columns.map((c) => (
                  <td key={c.no}>{bookCell(spec, c, r)}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
