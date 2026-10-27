'use client';

import * as Menu from '@radix-ui/react-dropdown-menu';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { cn } from '../../lib/cn';

export interface ActionItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  /** Lý do mục này chưa dùng được (khi `disabled`) hoặc lời nhắc ngắn dưới nhãn. */
  readonly hint?: string;
  /** Mục chưa tới bước: vẫn hiện nhưng mờ, kèm lý do. */
  readonly disabled?: boolean;
  readonly tone?: 'danger';
}

export interface ActionGroup {
  readonly label?: string;
  readonly items: readonly ActionItem[];
}

/** Menu "Thêm thao tác" (Figma N13 E6): thao tác gom theo nhóm, mục chưa tới bước hiện mờ kèm lý do; Radix lo bàn phím, focus và aria. */
export function ActionMenu({
  label = 'Thêm thao tác',
  groups,
}: {
  readonly label?: string;
  readonly groups: readonly ActionGroup[];
}) {
  const shown = groups.filter((g) => g.items.length > 0);
  if (shown.length === 0) return null;
  return (
    <Menu.Root>
      <Menu.Trigger className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-5 text-sm font-semibold text-ink hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brass">
        {label}
        <ChevronDown size={14} aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          className="z-50 max-h-[80vh] w-72 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-xl"
        >
          {shown.map((g, gi) => (
            <Menu.Group key={g.label ?? gi}>
              {gi > 0 ? <Menu.Separator className="my-1 h-px bg-line" /> : null}
              {g.label ? (
                <Menu.Label className="px-3 pt-2 pb-1 text-[11px] font-bold tracking-wide text-faint uppercase">
                  {g.label}
                </Menu.Label>
              ) : null}
              {g.items.map((it) =>
                it.disabled ? (
                  <Menu.Item
                    key={it.key}
                    disabled
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-faint outline-none"
                  >
                    {it.label}
                    {it.hint ? <span className="text-[11px] font-normal">{it.hint}</span> : null}
                  </Menu.Item>
                ) : (
                  <Menu.Item key={it.key} asChild>
                    <Link
                      href={it.href}
                      className={cn(
                        'block rounded-lg px-3 py-2.5 text-sm font-medium no-underline outline-none data-[highlighted]:bg-accent-soft',
                        it.tone === 'danger' ? 'text-danger' : 'text-ink',
                      )}
                    >
                      {it.label}
                      {it.hint ? (
                        <span className="mt-0.5 block text-xs font-normal text-muted">
                          {it.hint}
                        </span>
                      ) : null}
                    </Link>
                  </Menu.Item>
                ),
              )}
            </Menu.Group>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
