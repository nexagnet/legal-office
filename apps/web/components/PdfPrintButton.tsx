'use client';

import { useState } from 'react';
import { fetchPdfBlob, printPdfBlob } from '../lib/print-pdf';
import { Button } from './ui/button';

/** Nút "Xuất PDF để in": lấy PDF từ API rồi mở hộp thoại in của trình duyệt (không tải file về). */
export function PdfPrintButton({
  url,
  label = 'Xuất PDF để in',
  variant = 'primary',
}: {
  readonly url: string;
  readonly label?: string;
  readonly variant?: 'primary' | 'secondary';
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  return (
    <>
      <Button
        type="button"
        variant={variant}
        disabled={state === 'busy'}
        onClick={async () => {
          setState('busy');
          try {
            printPdfBlob(await fetchPdfBlob(url));
            setState('idle');
          } catch {
            setState('error');
          }
        }}
      >
        {state === 'busy' ? 'Đang dựng PDF…' : label}
      </Button>
      {state === 'error' ? (
        <span role="alert" className="text-sm text-danger">
          Không dựng được PDF. Thử lại.
        </span>
      ) : null}
    </>
  );
}
