import { Input } from './ui/field';

/**
 * Ô nhập cho cột "số, ngày, tháng, năm" của sổ: số hồ sơ do hệ thống tự cấp nên chỉ hiện làm chữ mờ phía trước,
 * người dùng chỉ nhập ngày tháng năm. Giá trị lưu chỉ là phần ngày; số được ghép khi hiển thị và xuất sổ.
 */
export function NumberDateInput({
  name,
  prefix,
  defaultValue,
}: {
  readonly name: string;
  /** Chữ mờ phía trước, ví dụ "037/2026/VB-THV ngày" hoặc "…/2026/VB-THV ngày" khi chưa cấp số. */
  readonly prefix: string;
  readonly defaultValue?: string;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className="shrink-0 text-[13px] font-normal text-muted" data-testid="number-prefix">
        {prefix}
      </span>
      <Input
        name={name}
        defaultValue={defaultValue}
        maxLength={2000}
        placeholder="dd/mm/yyyy"
        aria-label={`${prefix} (nhập ngày tháng năm)`}
      />
    </span>
  );
}
