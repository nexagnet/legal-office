'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

/**
 * Nút mở/đóng các dòng sổ con của một hồ sơ (Tống đạt, Sổ S-01: mỗi giấy tờ một dòng).
 * Chỉ đổi thuộc tính `data-open` của `<tbody>` chứa nó; CSS lo phần hiện/ẩn nên bảng vẫn dựng sẵn ở máy chủ.
 */
export function DmsRowToggle({
  count,
  caseTitle,
}: {
  readonly count: number;
  readonly caseTitle: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      className="dms-toggle"
      aria-expanded={open}
      aria-label={`${open ? 'Thu gọn' : 'Mở'} ${count} dòng Sổ S-01 của hồ sơ ${caseTitle}`}
      onClick={(e) => {
        const next = !open;
        setOpen(next);
        e.currentTarget.closest('tbody')?.setAttribute('data-open', String(next));
      }}
    >
      <ChevronDown aria-hidden="true" />
      {count} dòng sổ
    </button>
  );
}
