'use client';

import * as Menu from '@radix-ui/react-dropdown-menu';
import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { CloseContext } from './StageDialog';
import { Modal } from './ui/dialog';

export interface DialogAction {
  readonly key: string;
  readonly label: string;
  readonly title: string;
  readonly description?: string;
  /** Nội dung hộp thoại (form); tự đóng khi form gọi `useDialogClose()` sau khi thành công. */
  readonly body: ReactNode;
}

/**
 * Menu "Thêm thao tác" cho trang có thao tác là biểu mẫu ngắn (Figma N13 E11, E12): chọn mục thì mở hộp thoại một việc.
 * Khác `ActionMenu` (mục là đường dẫn).
 */
export function DialogActionMenu({
  label = 'Thêm thao tác',
  actions,
}: {
  readonly label?: string;
  readonly actions: readonly DialogAction[];
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  if (actions.length === 0) return null;
  const active = actions.find((a) => a.key === activeKey);
  return (
    <>
      <Menu.Root>
        <Menu.Trigger className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-5 text-sm font-semibold text-ink hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brass">
          {label}
          <ChevronDown size={14} aria-hidden="true" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            align="end"
            sideOffset={6}
            className="z-50 w-72 rounded-xl border border-line bg-surface p-1.5 shadow-xl"
          >
            {actions.map((a) => (
              <Menu.Item
                key={a.key}
                onSelect={() => setActiveKey(a.key)}
                className="block cursor-pointer rounded-lg px-3 py-2.5 text-sm font-medium text-ink outline-none data-[highlighted]:bg-accent-soft"
              >
                {a.label}
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      <Modal
        open={active !== undefined}
        onOpenChange={(o) => {
          if (!o) setActiveKey(null);
        }}
        title={active?.title ?? ''}
        description={active?.description}
      >
        <CloseContext.Provider value={() => setActiveKey(null)}>
          {active?.body}
        </CloseContext.Provider>
      </Modal>
    </>
  );
}
