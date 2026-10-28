'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TRANSFER_STATUS_LABEL, TRANSFER_STEP_LABEL, messageFor } from '../lib/messages';
import { pickedFile, postFile } from '../lib/upload';
import { FormSheet, text } from './EnforcementAssets';
import { Button } from './ui/button';
import { Field, Input, Select } from './ui/field';

export interface TransferStep {
  readonly step: string;
  readonly at: string;
}
export interface Transfer {
  readonly id: string;
  readonly toUserId: string;
  readonly status: string;
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly steps: readonly TransferStep[];
}

const STEP_ORDER = ['APP_APPROVAL', 'LEGAL_DECISION', 'HANDOVER_N08'] as const;

const atFmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

/** Đề xuất chuyển hồ sơ sang THV khác cùng văn phòng. */
export function ProposeTransferSheet({
  caseId,
  options,
}: {
  readonly caseId: string;
  readonly options: readonly { readonly userId: string; readonly label: string }[];
}) {
  return (
    <FormSheet
      trigger="Đề xuất chuyển hồ sơ"
      title="Đề xuất chuyển hồ sơ"
      description="Chuyển cho THV khác cùng văn phòng. Cần duyệt trong ứng dụng, quyết định pháp lý riêng và biên bản bàn giao N-08 trước khi hoàn tất."
      submitLabel="Gửi đề xuất"
      variant="primary"
      onSubmit={async (form) => {
        const toUserId = text(form, 'to');
        if (!toUserId) return 'Hãy chọn THV nhận hồ sơ.';
        const res = await fetch(`/api/enforcement/cases/${caseId}/transfers`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ toUserId }),
        });
        const json = (await res.json().catch(() => ({}))) as { code?: string };
        return { ok: res.ok, code: json.code };
      }}
    >
      <Field id="tr-to" label="THV nhận hồ sơ">
        <Select id="tr-to" name="to" defaultValue="">
          <option value="" disabled>
            Chọn THV
          </option>
          {options.map((o) => (
            <option key={o.userId} value={o.userId}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
    </FormSheet>
  );
}

/** Ghi một bước của chuyển hồ sơ, bắt buộc kèm tệp bằng chứng. */
export function TransferStepSheet({
  transferId,
  step,
}: {
  readonly transferId: string;
  readonly step: string;
}) {
  return (
    <FormSheet
      trigger={`Ghi bước: ${TRANSFER_STEP_LABEL[step] ?? step}`}
      title={TRANSFER_STEP_LABEL[step] ?? step}
      description="Tải tệp bằng chứng của bước này (PDF, JPEG, PNG). Quyền ghi từng bước do máy chủ kiểm."
      submitLabel="Ghi bước"
      onSubmit={(form) => {
        const file = pickedFile(form, 'file');
        if (!file) return Promise.resolve('Hãy chọn tệp bằng chứng.');
        return postFile(`enforcement/transfers/${transferId}/step-files`, file, { step });
      }}
    >
      <Field id={`ts-${transferId}-${step}`} label="Tệp bằng chứng">
        <Input
          id={`ts-${transferId}-${step}`}
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
        />
      </Field>
    </FormSheet>
  );
}

/** Hoàn tất chuyển hồ sơ (Admin hoặc Trưởng VP) khi đủ ba bước. */
export function CompleteTransferButton({ transferId }: { readonly transferId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function complete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/enforcement/transfers/${transferId}/completion`, {
        method: 'POST',
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setError(messageFor(json.code));
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button onClick={complete} loading={busy}>
        Hoàn tất chuyển hồ sơ
      </Button>
      {error ? (
        <span role="alert" className="text-[13px] text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}

export function TransferList({
  transfers,
  names,
  canWrite,
  canComplete,
}: {
  readonly transfers: readonly Transfer[];
  readonly names: Readonly<Record<string, string>>;
  readonly canWrite: boolean;
  readonly canComplete: boolean;
}) {
  if (transfers.length === 0) return <p className="muted">Chưa có đề nghị chuyển hồ sơ.</p>;
  return (
    <ul className="m-0 grid list-none gap-4 p-0">
      {transfers.map((t) => {
        const done = new Set(t.steps.map((s) => s.step));
        const pending = t.status === 'PROPOSED';
        const allDone = STEP_ORDER.every((s) => done.has(s));
        return (
          <li key={t.id} className="grid gap-2 border-b border-line pb-4 last:border-0 last:pb-0">
            <span className="font-semibold">
              Chuyển cho {names[t.toUserId] ?? 'THV được chọn'} ·{' '}
              {TRANSFER_STATUS_LABEL[t.status] ?? t.status}
            </span>
            <span className="text-[13px] text-muted">
              Đề nghị ngày {atFmt.format(new Date(t.createdAt))}
              {t.completedAt ? ` · hoàn tất ${atFmt.format(new Date(t.completedAt))}` : ''}
            </span>
            <ol className="m-0 grid list-none gap-1 p-0 text-[13px]">
              {STEP_ORDER.map((s) => {
                const rec = t.steps.find((x) => x.step === s);
                return (
                  <li key={s}>
                    {rec ? '✓' : '○'} {TRANSFER_STEP_LABEL[s]}
                    {rec ? ` · ${atFmt.format(new Date(rec.at))}` : ''}
                  </li>
                );
              })}
            </ol>
            {pending && canWrite ? (
              <div className="flex flex-wrap gap-2">
                {STEP_ORDER.filter((s) => !done.has(s)).map((s) => (
                  <TransferStepSheet key={s} transferId={t.id} step={s} />
                ))}
                {canComplete && allDone ? <CompleteTransferButton transferId={t.id} /> : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
