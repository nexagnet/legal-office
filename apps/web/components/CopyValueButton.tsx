'use client';

import { useState } from 'react';

/** Sao chép một số liệu để người dùng tự dán vào báo cáo (hệ thống không tự lập hay gửi báo cáo). */
export function CopyValueButton({
  value,
  label,
}: {
  readonly value: string;
  readonly label: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="font-semibold text-accent underline-offset-2 hover:underline"
      aria-label={`Sao chép ${label}`}
      onClick={() => {
        void navigator.clipboard
          ?.writeText(value)
          .then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          })
          .catch(() => undefined);
      }}
    >
      {done ? 'Đã chép' : 'Sao chép'}
    </button>
  );
}
