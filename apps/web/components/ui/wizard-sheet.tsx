'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Branch } from '../../app/session';
import { Button } from './button';
import { Field, Input, Select } from './field';
import { Notice, Sheet, SheetBody, SheetFooter } from './sheet';
import { Stepper } from './step-sheet';

export interface WizardField {
  readonly name: string;
  readonly label: string;
  readonly kind?: 'text' | 'datetime';
  readonly max?: number;
}
export interface WizardStep {
  readonly title: string;
  readonly fields: readonly WizardField[];
}

interface Props {
  readonly trigger: string;
  readonly title: string;
  readonly steps: readonly WizardStep[];
  readonly branches: readonly Branch[];
  readonly submitLabel: string;
  readonly failTitle: string;
  readonly onSubmit: (
    values: Readonly<Record<string, string>>,
    branch: Branch,
  ) => Promise<{ ok: boolean; code?: string }>;
  readonly messageFor: (code: string | undefined) => string;
}

const CONFIRM = 'Xác nhận';

/**
 * Ngăn kéo tạo mới nhiều bước (Figma N12 D7/D11): các bước nhập liệu khai báo bằng `steps`,
 * bước cuối luôn là "Xác nhận" tóm tắt. Quyền do máy chủ kiểm; thông báo lỗi lấy từ mã lỗi.
 */
export function WizardSheet({
  trigger,
  title,
  steps,
  branches,
  submitLabel,
  failTitle,
  onSubmit,
  messageFor,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const names = [...steps.map((s) => s.title), CONFIRM];
  const last = steps.length;

  const close = () => {
    setOpen(false);
    setStep(0);
    setValues({});
    setErrors({});
    setError(null);
  };

  function validate(s: number) {
    const e: Record<string, string> = {};
    for (const f of steps[s]?.fields ?? []) {
      if (!(values[f.name] ?? '').trim()) e[f.name] = `Nhập ${f.label.toLowerCase()}.`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    const branch = branches.find((b) => b.id === branchId);
    if (!branch) return setError('Chọn chi nhánh.');
    setBusy(true);
    setError(null);
    try {
      const r = await onSubmit(values, branch);
      if (!r.ok) return setError(messageFor(r.code));
      close();
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  if (branches.length === 0) return null;
  const summary: [string, string][] = [
    ['Chi nhánh', branches.find((b) => b.id === branchId)?.name ?? ''],
    ...steps.flatMap((s) =>
      s.fields.map((f): [string, string] => [
        f.label,
        f.kind === 'datetime'
          ? new Date(values[f.name] ?? '').toLocaleString('vi-VN')
          : (values[f.name] ?? ''),
      ]),
    ),
  ];
  return (
    <>
      <Button onClick={() => setOpen(true)}>{trigger}</Button>
      <Sheet open={open} onOpenChange={(o) => (o ? setOpen(true) : close())} title={title}>
        <Stepper steps={names} current={step} />
        <SheetBody>
          {step < last ? (
            <>
              {step === 0 && branches.length > 1 ? (
                <Field id="wz-branch" label="Chi nhánh">
                  <Select
                    id="wz-branch"
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              {steps[step]?.fields.map((f) => (
                <Field key={f.name} id={`wz-${f.name}`} label={f.label} error={errors[f.name]}>
                  <Input
                    id={`wz-${f.name}`}
                    type={f.kind === 'datetime' ? 'datetime-local' : 'text'}
                    maxLength={f.max}
                    value={values[f.name] ?? ''}
                    invalid={!!errors[f.name]}
                    onChange={(e) => setValues((p) => ({ ...p, [f.name]: e.target.value }))}
                  />
                </Field>
              ))}
            </>
          ) : (
            <dl className="m-0 grid gap-0">
              {summary.map(([k, v]) => (
                <div key={k} className="grid gap-0.5 border-b border-line py-2.5">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="m-0 text-sm font-semibold text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {error ? (
            <Notice tone="danger" title={failTitle}>
              {error}
            </Notice>
          ) : null}
        </SheetBody>
        <SheetFooter>
          {step === 0 ? (
            <Button variant="secondary" onClick={close}>
              Huỷ
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => setStep(step - 1)}
              disabled={busy}
              aria-busy={busy}
            >
              Quay lại
            </Button>
          )}
          <span className="flex-1" />
          {step < last ? (
            <Button onClick={() => validate(step) && setStep(step + 1)}>
              Tiếp tục: {names[step + 1]} →
            </Button>
          ) : (
            <Button onClick={() => void submit()} disabled={busy} aria-busy={busy}>
              {busy ? 'Đang lưu…' : submitLabel}
            </Button>
          )}
        </SheetFooter>
      </Sheet>
    </>
  );
}
