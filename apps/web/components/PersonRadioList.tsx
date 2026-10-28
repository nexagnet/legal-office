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
    <fieldset className="person-choice">
      <legend>{legend}</legend>
      {options.map((o) => (
        <label key={o.userId}>
          <input
            type="radio"
            name={name}
            value={o.userId}
            required
            defaultChecked={o.userId === selected}
          />
          <Avatar name={personName(o.label)} id={o.userId} />
          <span className="person-choice-name">{personName(o.label)}</span>
        </label>
      ))}
    </fieldset>
  );
}
