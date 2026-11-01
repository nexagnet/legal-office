export interface Kpi {
  readonly label: string;
  readonly value: number | string;
  /** Sắc thái số liệu; mặc định theo màu nghiệp vụ đang mở. */
  readonly tone?: 'ok' | 'warn' | 'danger';
}

/** Dải số liệu đầu danh sách (Figma N3–N6): một thẻ một chỉ số, vạch màu bên trái. */
export function KpiStrip({
  items,
  label,
}: {
  readonly items: readonly Kpi[];
  readonly label: string;
}) {
  return (
    <dl className="kpi-strip" aria-label={label}>
      {items.map((k) => (
        <div key={k.label} className="kpi" data-tone={k.tone}>
          <dt>{k.label}</dt>
          <dd>{typeof k.value === 'number' ? k.value.toLocaleString('vi-VN') : k.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Số phần tử có `status` thuộc tập cho trước. */
export function countStatus<T extends { readonly status: string }>(
  items: readonly T[],
  ...statuses: readonly string[]
): number {
  return items.filter((i) => statuses.includes(i.status)).length;
}
