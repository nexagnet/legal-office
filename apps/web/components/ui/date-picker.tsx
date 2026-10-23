'use client';

import * as Popover from '@radix-ui/react-popover';
import { format, isValid, parseISO } from 'date-fns';
import { vi } from 'date-fns/locale';
import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { cn } from '../../lib/cn';

interface Props {
  readonly id: string;
  /** Giá trị dạng `yyyy-MM-dd` (đúng định dạng API), rỗng nếu chưa chọn. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly invalid?: boolean;
  readonly describedBy?: string;
}

/** Chọn ngày hiển thị dd/MM/yyyy (không dùng `type=date` vì trình duyệt hiện mm/dd/yyyy). */
export function DatePicker({ id, value, onChange, invalid, describedBy }: Props) {
  const [open, setOpen] = useState(false);
  const parsed = value ? parseISO(value) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        id={id}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className={cn(
          'flex min-h-11 w-full items-center justify-between rounded-[10px] border bg-surface px-3.5 text-sm focus-visible:ring-3 focus-visible:ring-accent/20 focus-visible:outline-none',
          invalid ? 'border-danger' : 'border-line-strong',
          selected ? 'text-ink' : 'text-faint',
        )}
      >
        {selected ? format(selected, 'dd/MM/yyyy') : 'dd/MM/yyyy'}
        <CalendarDays size={18} aria-hidden="true" className="text-muted" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-[60] rounded-2xl border border-line bg-surface p-3 shadow-xl"
        >
          <DayPicker
            mode="single"
            locale={vi}
            selected={selected}
            defaultMonth={selected}
            onSelect={(d) => {
              if (!d) return;
              onChange(format(d, 'yyyy-MM-dd'));
              setOpen(false);
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
