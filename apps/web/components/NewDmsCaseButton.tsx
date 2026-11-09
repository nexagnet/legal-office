'use client';

import Link from 'next/link';
import { useState } from 'react';
import { NewDmsCaseForm } from './NewDmsCaseForm';
import { Button } from './ui/button';
import { Modal } from './ui/dialog';

/** Nút "+ Tạo hồ sơ" cạnh bộ lọc (Figma "Vi bằng · Danh sách"): form mở trong hộp thoại, tạo xong vào thẳng hồ sơ nháp. */
export function NewDmsCaseButton({
  officeId,
  domainCode,
  label,
  buttonLabel = '+ Tạo hồ sơ',
  redirectBase,
}: {
  readonly officeId: string;
  readonly domainCode: string;
  readonly label: string;
  readonly buttonLabel?: string;
  readonly redirectBase: string;
}) {
  const [open, setOpen] = useState(false);
  // Bốn nghiệp vụ chính có trang tạo riêng theo Figma; ba sổ Văn thư (mã vt…) giữ hộp thoại gọn.
  if (!domainCode.startsWith('vt')) {
    return (
      <Button asChild>
        <Link className="no-underline" href={`${redirectBase}/tao-moi`}>
          {buttonLabel}
        </Link>
      </Button>
    );
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>{buttonLabel}</Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={`Tạo hồ sơ ${label}`}
        description="Hồ sơ mới là bản nháp, chưa có STT cho tới khi xác nhận lưu chính thức."
      >
        <NewDmsCaseForm officeId={officeId} domainCode={domainCode} redirectBase={redirectBase} />
      </Modal>
    </>
  );
}
