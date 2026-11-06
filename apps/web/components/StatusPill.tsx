import { statusTone, type StatusTone } from '../lib/status-tone';

/**
 * Trạng thái dạng nhãn màu theo sắc thái; luôn kèm chữ nên không phụ thuộc màu.
 * `tone` chỉ dùng khi cùng một mã trạng thái mang nghĩa khác nhau ở từng màn (vd. RETURNED của đề xuất).
 */
export function StatusPill({
  status,
  label,
  tone,
}: {
  readonly status: string;
  readonly label: string;
  readonly tone?: StatusTone;
}) {
  return (
    <span className="pill" data-tone={tone ?? statusTone(status)} data-status={status}>
      {label}
    </span>
  );
}
