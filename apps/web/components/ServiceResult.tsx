'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ATTEMPT_OUTCOME_LABEL, UNDELIVERABLE_LABEL, messageFor } from '../lib/messages';
import { useDialogClose } from './StageDialog';
import { Button } from './ui/button';
import { Notice, Sheet, SheetBody, SheetFooter } from './ui/sheet';

type Kind = 'served' | 'attempt' | 'undeliverable';
type Result = { readonly ok: boolean; readonly code?: string };

async function send(
  path: string,
  init: { body?: BodyInit; contentType?: string; json?: unknown },
): Promise<Result> {
  const res = await fetch(`/api/service-of-documents/${path}`, {
    method: 'POST',
    headers: { 'content-type': init.contentType ?? 'application/json' },
    body: init.json === undefined ? init.body : JSON.stringify(init.json),
  });
  const json = (await res.json().catch(() => ({}))) as { code?: string };
  return { ok: res.ok, code: json.code };
}

/** Một lựa chọn kết quả: thẻ có nút chọn; chọn thì biểu mẫu của riêng lựa chọn đó hiện ngay trong thẻ. */
function Option({
  value,
  checked,
  disabled,
  tone,
  title,
  hint,
  onSelect,
  children,
}: {
  readonly value: Kind;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly tone: 'ok' | 'accent' | 'danger';
  readonly title: string;
  readonly hint: string;
  readonly onSelect: (k: Kind) => void;
  readonly children?: ReactNode;
}) {
  const ring = {
    ok: 'border-ok bg-ok-soft/40',
    accent: 'border-accent bg-accent-soft/40',
    danger: 'border-danger bg-danger-soft/40',
  }[tone];
  return (
    <div
      className={`grid gap-3 rounded-xl border p-3.5 ${checked ? `border-2 ${ring}` : 'border-line bg-surface'} ${disabled ? 'opacity-60' : ''}`}
    >
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="radio"
          name="kind"
          value={value}
          checked={checked}
          disabled={disabled}
          onChange={() => onSelect(value)}
          className="mt-1 size-4 accent-[var(--accent)]"
        />
        <span className="grid gap-0.5">
          <span className="text-[15px] font-semibold text-ink">{title}</span>
          <span className="text-[13px] text-muted">{hint}</span>
        </span>
      </label>
      {checked ? children : null}
    </div>
  );
}

/**
 * Nút chính của bước "Đi tống đạt" (Figma N15 T3a/b/c): mở ngăn kéo để chọn một trong ba kết quả
 * của lần đi này. Mỗi kết quả có biểu mẫu riêng, nên không còn ba biểu mẫu xếp chồng trên trang.
 */
export function ServiceResultSheet({
  documentId,
  attempts,
}: {
  readonly documentId: string;
  readonly attempts: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>('attempt');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const canConclude = attempts > 0;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const evidence = (e.currentTarget.elements.namedItem('evidence') as HTMLInputElement | null)
      ?.files?.[0];
    let call: () => Promise<Result>;
    if (kind === 'served') {
      if (!evidence || evidence.size === 0) return setError(messageFor('INVALID_DOCUMENT'));
      call = () =>
        send(`documents/${documentId}/served`, {
          body: evidence,
          contentType: evidence.type,
        });
    } else if (kind === 'attempt') {
      const outcome = String(form.get('outcome'));
      call = () => send(`documents/${documentId}/attempts`, { json: { outcome } });
    } else {
      const reason = String(form.get('reason'));
      call = () => send(`documents/${documentId}/undeliverable`, { json: { reason } });
    }
    setBusy(true);
    setError(null);
    try {
      const r = await call();
      if (!r.ok) {
        const message = messageFor(r.code);
        setError(message);
        toast.error(message, { duration: Infinity });
        return;
      }
      toast.success(
        kind === 'served'
          ? 'Đã ghi nhận đã tống đạt'
          : kind === 'attempt'
            ? 'Đã ghi nhận lần tống đạt'
            : 'Đã kết luận không tống đạt được',
      );
      setOpen(false);
      router.refresh();
    } catch {
      const message = 'Không kết nối được máy chủ. Vui lòng thử lại.';
      setError(message);
      toast.error(message, { duration: Infinity });
    } finally {
      setBusy(false);
    }
  }

  const confirm =
    kind === 'served'
      ? 'Xác nhận đã tống đạt'
      : kind === 'attempt'
        ? `Lưu lần thử thứ ${attempts + 1}`
        : 'Kết luận không tống đạt được';

  return (
    <>
      <Button
        type="button"
        className="min-h-12 w-full text-base sm:w-fit"
        onClick={() => setOpen(true)}
      >
        Ghi nhận kết quả lần tống đạt
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Ghi nhận kết quả"
        description={`Đây sẽ là lần đi thứ ${attempts + 1}. Giờ ghi nhận do hệ thống tự lấy.`}
      >
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <SheetBody>
            <p className="text-[15px] font-bold text-ink">Lần đi này kết quả thế nào?</p>
            <Option
              value="served"
              checked={kind === 'served'}
              tone="ok"
              title="Đã đưa được văn bản cho người nhận"
              hint="Kết thúc việc. Cần tải bằng chứng."
              onSelect={setKind}
            >
              <label className="grid gap-1.5 text-[13px] font-semibold text-ink">
                Bằng chứng đã tống đạt (PDF, JPEG, PNG; tối đa 25 MB)
                <input
                  name="evidence"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  required
                  onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
                  className="rounded-lg border border-line-strong bg-surface p-2 text-sm font-normal"
                />
              </label>
              {fileName ? <p className="text-xs text-ok">Đã chọn: {fileName}</p> : null}
              <Notice tone="info" title="Sau khi xác nhận">
                Việc chuyển sang "Đã tống đạt" và không sửa được.
              </Notice>
            </Option>
            <Option
              value="attempt"
              checked={kind === 'attempt'}
              tone="accent"
              title="Chưa gặp được người nhận"
              hint="Việc vẫn mở, bạn sẽ thử lại sau."
              onSelect={setKind}
            >
              <fieldset className="grid gap-2 border-0 p-0">
                <legend className="mb-1 text-[13px] font-semibold text-ink">
                  Vì sao chưa gặp được?
                </legend>
                {Object.entries(ATTEMPT_OUTCOME_LABEL).map(([k, v]) => (
                  <label
                    key={k}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line bg-surface px-3 text-sm has-[:checked]:border-accent has-[:checked]:font-semibold"
                  >
                    <input
                      type="radio"
                      name="outcome"
                      value={k}
                      defaultChecked={k === 'ABSENT'}
                      className="size-4 accent-[var(--accent)]"
                    />
                    {v}
                  </label>
                ))}
              </fieldset>
            </Option>
            <Option
              value="undeliverable"
              checked={kind === 'undeliverable'}
              disabled={!canConclude}
              tone="danger"
              title="Không thể tống đạt được"
              hint={
                canConclude
                  ? 'Kết thúc việc, không hoàn tác.'
                  : 'Cần ít nhất một lần đã thử trước khi kết luận.'
              }
              onSelect={setKind}
            >
              <fieldset className="grid gap-2 border-0 p-0">
                <legend className="mb-1 text-[13px] font-semibold text-ink">
                  Lý do không tống đạt được
                </legend>
                {Object.entries(UNDELIVERABLE_LABEL).map(([k, v], i) => (
                  <label
                    key={k}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line bg-surface px-3 text-sm has-[:checked]:border-danger has-[:checked]:font-semibold"
                  >
                    <input
                      type="radio"
                      name="reason"
                      value={k}
                      defaultChecked={i === 0}
                      className="size-4 accent-[var(--danger)]"
                    />
                    {v}
                  </label>
                ))}
              </fieldset>
              <Notice tone="warn" title="Kết luận này đóng việc">
                Không mở lại được. Nếu còn khả năng gặp người nhận, hãy chọn "Chưa gặp được người
                nhận" để thử lại.
              </Notice>
            </Option>
            <p role="alert" className="error" hidden={!error}>
              {error}
            </p>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button
              type="submit"
              variant={kind === 'undeliverable' ? 'danger' : 'primary'}
              loading={busy}
            >
              {confirm}
            </Button>
          </SheetFooter>
        </form>
      </Sheet>
    </>
  );
}

/** Nhắc người xử lý: thao tác phụ, nằm trong menu "Thêm thao tác" của trang. */
export function ServiceReminder({ documentId }: { readonly documentId: string }) {
  const router = useRouter();
  const close = useDialogClose();
  const [busy, setBusy] = useState(false);
  async function remind() {
    setBusy(true);
    try {
      const r = await send(`documents/${documentId}/reminders`, {});
      if (!r.ok) return void toast.error(messageFor(r.code), { duration: Infinity });
      toast.success('Đã nhắc người xử lý');
      router.refresh();
      close?.();
    } catch {
      toast.error('Không kết nối được máy chủ. Vui lòng thử lại.', { duration: Infinity });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted">
        Hệ thống gửi một lời nhắc tới người xử lý văn bản này. Việc vẫn giữ nguyên trạng thái.
      </p>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={() => close?.()}>
          Hủy
        </Button>
        <Button type="button" loading={busy} onClick={() => void remind()}>
          Nhắc người xử lý
        </Button>
      </div>
    </div>
  );
}
