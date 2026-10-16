interface Props {
  readonly label: string;
  readonly value: number | string;
  readonly note: string;
  readonly tone?: 'blue' | 'green' | 'amber' | 'red';
}

/** Thẻ số liệu: thanh màu dọc bên trái, nhãn, số lớn, ghi chú (Figma 3:2). */
export function StatCard({ label, value, note, tone = 'blue' }: Props) {
  return (
    <div className="stat" data-tone={tone}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      <p className="stat-note">{note}</p>
    </div>
  );
}
