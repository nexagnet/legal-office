'use client';

import * as Menu from '@radix-ui/react-dropdown-menu';
import { Ellipsis } from 'lucide-react';
import { useState } from 'react';
import type { Branch } from '../app/session';
import { Button } from './ui/button';
import { Modal } from './ui/dialog';
import { Sheet, SheetBody } from './ui/sheet';
import { AdjustBatchForm, NewItemForm, StockMovementForm, ThresholdForm } from './StockForms';

/** Nhập/xuất kho trong ngăn kéo (Figma N12 D9): nút riêng, form chỉ hiện khi cần. */
export function MovementSheet({
  items,
  branches,
}: {
  readonly items: readonly { itemId: string; name: string }[];
  readonly branches: readonly Branch[];
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0 || branches.length === 0) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>Nhập / xuất</Button>
      <Sheet open={open} onOpenChange={setOpen} title="Nhập, xuất vật tư">
        <SheetBody>
          <StockMovementForm items={items} branches={branches} />
        </SheetBody>
      </Sheet>
    </>
  );
}

/** Menu "…" cạnh nút chính (Figma N12 D9): việc ít dùng như thêm vật tư nằm trong menu, ngăn kéo mở khi chọn. */
export function StockMoreMenu({ officeId }: { readonly officeId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          aria-label="Thêm tác vụ vật tư"
          className="inline-flex size-11 items-center justify-center rounded-[10px] border border-line-strong bg-surface text-ink hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brass"
        >
          <Ellipsis size={18} aria-hidden="true" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            align="end"
            sideOffset={6}
            className="z-50 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-xl"
          >
            <Menu.Item
              onSelect={() => setOpen(true)}
              className="block cursor-pointer rounded-lg px-3 py-2.5 text-sm font-medium text-ink outline-none data-[highlighted]:bg-accent-soft"
            >
              Thêm vật tư
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      <Sheet open={open} onOpenChange={setOpen} title="Thêm vật tư">
        <SheetBody>
          <NewItemForm officeId={officeId} />
        </SheetBody>
      </Sheet>
    </>
  );
}

/** Điều chỉnh (kiểm kê) một lô trong hộp thoại; chỉ Admin/Trưởng VP thấy, máy chủ vẫn kiểm quyền. */
export function AdjustBatchDialog({
  batchId,
  itemName,
  receiptRef,
  remaining,
  received,
}: {
  readonly batchId: string;
  readonly itemName: string;
  readonly receiptRef: string;
  readonly remaining: number;
  readonly received: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Điều chỉnh lô
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Điều chỉnh lô (kiểm kê)"
        description={`${itemName} · Phiếu ${receiptRef} · ghi sổ ${remaining}/${received}`}
      >
        <AdjustBatchForm batchId={batchId} remaining={remaining} received={received} />
        <p className="text-[13px] text-muted">
          Chỉ Admin và Trưởng văn phòng được điều chỉnh. Thao tác được ghi vào lịch sử lô.
        </p>
      </Modal>
    </>
  );
}

/** Ngưỡng "Sắp hết" của một vật tư; chỉ Admin thấy, máy chủ vẫn kiểm quyền. */
export function ThresholdDialog({
  itemId,
  itemName,
  current,
}: {
  readonly itemId: string;
  readonly itemName: string;
  readonly current: number | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        {current === null ? 'Đặt ngưỡng' : `Ngưỡng ${current}`}
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Ngưỡng cảnh báo tồn kho"
        description={itemName}
      >
        <ThresholdForm itemId={itemId} current={current} />
      </Modal>
    </>
  );
}
