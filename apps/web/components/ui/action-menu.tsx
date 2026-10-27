'use client';

import * as Menu from '@radix-ui/react-dropdown-menu';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';

export interface ActionItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly hint?: string;
  /** Vạch ngăn nhóm phía trên mục này. */
  readonly separated?: boolean;
}

/** Menu "Thêm thao tác" (Figma N12 D2): thao tác hiếm gom lại; Radix lo bàn phím, focus và aria. */
export function ActionMenu({
  label = 'Thêm thao tác',
  items,
}: {
  readonly label?: string;
  readonly items: readonly ActionItem[];
}) {
  if (items.length === 0) return null;
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
          className="z-50 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-xl"
        >
          {items.map((it) => (
            <div key={it.key}>
              {it.separated ? <Menu.Separator className="my-1 h-px bg-line" /> : null}
              <Menu.Item asChild>
                <Link
                  href={it.href}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink no-underline outline-none data-[highlighted]:bg-accent-soft"
                >
                  {it.label}
                  {it.hint ? (
                    <span className="mt-0.5 block text-xs font-normal text-muted">{it.hint}</span>
                  ) : null}
                </Link>
              </Menu.Item>
            </div>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
