import { UserRound } from 'lucide-react';
import { avatarColor, initialsOf } from '../../lib/avatar';
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
