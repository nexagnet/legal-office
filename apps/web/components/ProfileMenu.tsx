'use client';

import * as Menu from '@radix-ui/react-dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';

/** Thẻ người dùng ở góc phải thanh trên (Figma N12): avatar, vai, menu có Đăng xuất. */
export function ProfileMenu({
  initials,
  roleLabel,
}: {
  readonly initials: string;
  readonly roleLabel: string;
}) {
  const router = useRouter();
  return (
    <Menu.Root>
      <Menu.Trigger className="appbar-profile" aria-label={`Tài khoản: ${roleLabel}`}>
        <span className="appbar-avatar" aria-hidden="true">
          {initials}
        </span>
        <span className="appbar-profile-text">
          <strong>{roleLabel}</strong>
          <small>Xem quyền theo tài khoản</small>
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          className="z-50 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-xl"
        >
          <Menu.Item
            className="block cursor-pointer rounded-lg px-3 py-2.5 text-sm font-medium text-ink outline-none data-[highlighted]:bg-accent-soft"
            onSelect={async () => {
              await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
              router.push('/login');
              router.refresh();
            }}
          >
            Đăng xuất
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
