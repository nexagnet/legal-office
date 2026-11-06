'use client';

import { useState, type ReactNode } from 'react';
import { Button } from './button';
import { Modal } from './dialog';

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  /** Nhãn nút xác nhận (mặc định "Xác nhận"). */
  readonly confirmLabel?: string;
  readonly danger?: boolean;
  /** Có thì hiện ô nhập lý do bắt buộc; nút xác nhận chỉ bật khi đã có chữ. */
  readonly reasonLabel?: string;
  readonly busy?: boolean;
  readonly onConfirm: (reason: string) => void;
  readonly children?: ReactNode;
}

/** Hộp xác nhận trong trang, thay window.confirm/prompt (Figma không có hộp thoại gốc của trình duyệt). */
export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Xác nhận',
  danger = false,
  reasonLabel,
  busy = false,
  onConfirm,
  children,
}: Props) {
  const [reason, setReason] = useState('');
  const needsReason = reasonLabel !== undefined;
  const blocked = busy || (needsReason && reason.trim() === '');
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} description={description}>
      {children}
      {needsReason ? (
        <label className="grid gap-1 text-sm font-medium">
          {reasonLabel}
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            required
            className="min-h-11 rounded-[10px] border border-line-strong px-3"
          />
        </label>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
          Quay lại
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          type="button"
          loading={busy}
          disabled={blocked}
          onClick={() => onConfirm(reason.trim())}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
