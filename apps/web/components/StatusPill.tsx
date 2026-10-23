import { statusTone } from '../lib/status-tone';

/** Trạng thái dạng nhãn màu theo sắc thái; luôn kèm chữ nên không phụ thuộc màu. */
export function StatusPill({ status, label }: { readonly status: string; readonly label: string }) {
  return (
    <span className="pill" data-tone={statusTone(status)} data-status={status}>
      {label}
    </span>
  );
}
