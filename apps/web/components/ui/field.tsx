import * as LabelPrimitive from '@radix-ui/react-label';
import type {
  ComponentProps,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '../../lib/cn';

const control =
  'block w-full rounded-[10px] border bg-surface px-3.5 text-sm text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20 disabled:bg-surface-2 disabled:text-faint';
const tone = (invalid?: boolean) =>
  invalid ? 'border-danger' : 'border-line-strong focus-visible:border-accent';

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn('text-[13px] font-semibold text-ink', className)}
      {...props}
    />
  );
}

type Invalid = { readonly invalid?: boolean };

export function Input({
  className,
  invalid,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & Invalid) {
  return (
    <input
      className={cn(control, 'min-h-11', tone(invalid), className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function Textarea({
  className,
  invalid,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & Invalid) {
  return (
    <textarea
      className={cn(control, 'min-h-24 py-2.5', tone(invalid), className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

/** Ô chọn dùng `<select>` gốc: bàn phím và đọc màn hình đúng sẵn, không thêm phụ thuộc. */
export function Select({
  className,
  invalid,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & Invalid) {
  return (
    <select
      className={cn(control, 'min-h-11', tone(invalid), className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

/** Nhãn trên – ô nhập – trợ giúp hoặc lỗi dưới (khung Form/Field trong Figma). */
export function Field({
  id,
  label,
  help,
  error,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly help?: string;
  readonly error?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : help ? (
        <p id={`${id}-help`} className="text-xs text-muted">
          {help}
        </p>
      ) : null}
    </div>
  );
}
