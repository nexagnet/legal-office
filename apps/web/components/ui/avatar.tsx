import { UserRound } from 'lucide-react';
import { avatarColor, initialsOf, looksLikeOrganization, personName } from '../../lib/avatar';
import { cn } from '../../lib/cn';

const SIZE = {
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-xs',
  lg: 'size-12 text-lg',
} as const;

/**
 * Avatar chữ viết tắt cho một CON NGƯỜI (Figma N0 · Avatar). Không dùng cho tổ chức hay pháp nhân và không có ảnh
 * đại diện. `id` (mã người dùng) làm màu ổn định; không có thì lấy theo họ tên. Có `aria-label` là họ tên đầy đủ.
 */
export function Avatar({
  name,
  id,
  size = 'md',
  className,
}: {
  readonly name: string;
  readonly id?: string | null;
  readonly size?: keyof typeof SIZE;
  readonly className?: string;
}) {
  const initials = initialsOf(name);
  return (
    <span
      role="img"
      aria-label={name || 'Người dùng'}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full font-bold text-white select-none',
        SIZE[size],
        className,
      )}
      style={{ backgroundColor: avatarColor(id ?? (name || 'x')) }}
    >
      {initials || <UserRound aria-hidden="true" className="size-[60%]" />}
    </span>
  );
}

/** Avatar kèm họ tên, dùng cho dòng "Người thực hiện", "Người tạo"… */
export function Person({
  name,
  id,
  size = 'md',
}: {
  readonly name: string;
  readonly id?: string | null;
  readonly size?: keyof typeof SIZE;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <Avatar name={name} id={id} size={size} />
      <span>{name}</span>
    </span>
  );
}

/** Người theo nhãn do API trả ("Họ tên (email)" hoặc email): avatar và họ tên. Thiếu nhãn thì hiện `fallback`. */
export function PersonLabel({
  label,
  id,
  size = 'sm',
  fallback,
}: {
  readonly label: string | null | undefined;
  readonly id?: string | null;
  readonly size?: keyof typeof SIZE;
  readonly fallback?: string;
}) {
  if (!label) return fallback ? <span className="text-muted">{fallback}</span> : null;
  return <Person name={personName(label)} id={id} size={size} />;
}

/**
 * Tên một bên trong hồ sơ (người nhận tống đạt, bên được xác minh, đương sự, khách): cá nhân có avatar, tổ chức chỉ hiện chữ.
 * `person` là cờ loại khi dữ liệu có (PERSON/ORGANIZATION); không có thì nhận diện theo tên.
 */
export function PartyName({
  name,
  person,
  size = 'sm',
}: {
  readonly name: string;
  readonly person?: boolean;
  readonly size?: keyof typeof SIZE;
}) {
  const isPerson = person ?? !looksLikeOrganization(name);
  return isPerson ? <Person name={name} size={size} /> : <span>{name}</span>;
}
