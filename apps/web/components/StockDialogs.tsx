'use client';

import { useState } from 'react';
import type { Branch } from '../app/session';
import { Button } from './ui/button';
import { Modal } from './ui/dialog';
import { Sheet, SheetBody } from './ui/sheet';
import { AdjustBatchForm, NewItemForm, StockMovementForm } from './StockForms';

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

export function NewItemSheet({ officeId }: { readonly officeId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        + Thêm vật tư
      </Button>
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
