import { Input } from './ui/field';

/**
 * Gợi ý giá trị cho vài cột sổ cần lọc theo nghiệp vụ (hình thức tống đạt, kết quả xác minh, kết quả thi hành án).
 * Chỉ là gợi ý: người nhập vẫn gõ tự do được, giá trị cũ giữ nguyên. Gợi ý thống nhất cách ghi thì bộ lọc "Hình thức",
 * "Kết quả" gom được đúng, không bị tách thành nhiều cách viết.
 */
export const ATTR_SUGGESTIONS: Readonly<Record<string, readonly string[]>> = {
  hinh_thuc_tong_dat: ['Trực tiếp', 'Niêm yết', 'Qua bưu chính', 'Qua phương tiện điện tử'],
  ket_qua_xac_minh: ['Xác minh được tài sản', 'Không xác minh được', 'Đang xác minh'],
  ket_qua_thi_hanh_an: ['Thi hành xong', 'Đang thi hành', 'Đình chỉ thi hành', 'Chấm dứt thi hành'],
};

export function AttrInput({
  name,
  defaultValue,
  tick,
}: {
  readonly name: string;
  readonly defaultValue?: string;
  readonly tick?: boolean;
}) {
  const options = ATTR_SUGGESTIONS[name];
  const listId = options ? `sg-${name}` : undefined;
  return (
    <>
      <Input
        name={name}
        defaultValue={defaultValue}
        maxLength={2000}
        placeholder={tick ? 'Gõ x nếu có' : options ? 'Chọn gợi ý hoặc gõ' : undefined}
        list={listId}
      />
      {options ? (
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      ) : null}
    </>
  );
}
