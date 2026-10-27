'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from './ui/button';
import { Sheet, SheetBody } from './ui/sheet';
import { NewCustomerForm } from './CustomerForms';

/** Thêm khách hàng trong ngăn kéo (Figma N12 D7); thêm xong mở luôn hồ sơ khách để nhập thông tin. */
export function NewCustomerSheet() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        + Thêm khách hàng
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Thêm khách hàng">
        <SheetBody>
          <NewCustomerForm
            onCreated={(id) => {
              setOpen(false);
              router.push(`/hop-dong/khach/${id}`);
            }}
          />
        </SheetBody>
      </Sheet>
    </>
  );
}
