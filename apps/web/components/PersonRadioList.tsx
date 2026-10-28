import { personName } from '../lib/avatar';
import { Avatar } from './ui/avatar';

export interface PersonOption {
  readonly userId: string;
  readonly label: string;
}

/**
 * Chọn một người trong danh sách: mỗi người một dòng có avatar và họ tên (thay ô chọn gốc của trình duyệt, vốn không chèn
 * được avatar). Dùng trong biểu mẫu thường: giá trị gửi đi là `name` của nhóm nút chọn.
 */
export function PersonRadioList({
  legend,
  name,
  options,
  defaultId,
}: {
  readonly legend: string;
  readonly name: string;
  readonly options: readonly PersonOption[];
  readonly defaultId?: string | null;
}) {
  const selected = defaultId ?? options[0]?.userId;
  return (
    <fieldset className="grid gap-2 border-0 p-0">
      <legend className="mb-1 text-[13px] font-semibold">{legend}</legend>
      {options.map((o) => (
        <label
          key={o.userId}
          className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-3 text-sm has-[:checked]:border-2 has-[:checked]:border-accent has-[:checked]:bg-accent-soft/40"
        >
          <input
            type="radio"
            name={name}
            value={o.userId}
            required
            defaultChecked={o.userId === selected}
            className="size-4 accent-[var(--accent)]"
          />
          <Avatar name={personName(o.label)} id={o.userId} />
          <span className="font-semibold">{personName(o.label)}</span>
        </label>
      ))}
    </fieldset>
  );
}
