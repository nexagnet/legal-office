'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CORRESPONDENCE_DIRECTION_LABEL, messageFor } from '../lib/messages';
import { postFile } from '../lib/upload';
import type { Branch } from '../app/session';
import { Button } from './ui/button';
import { DatePicker } from './ui/date-picker';
import { Field, Input, Select } from './ui/field';
import { Notice, Sheet, SheetBody, SheetFooter } from './ui/sheet';
import { Stepper } from './ui/step-sheet';

const STEPS = ['Thông tin', 'Đính kèm', 'Xác nhận'] as const;
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_BYTES = 25 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Values {
  direction: string;
  branchId: string;
  docType: string;
  counterparty: string;
  subject: string;
  refNo: string;
  receivedOn: string;
}

/**
 * Vào sổ công văn trong ngăn kéo 3 bước (Figma N12 D7): thông tin → đính kèm (tuỳ chọn) → xác nhận.
 * Quyền do máy chủ kiểm; tệp đính kèm gửi sau khi tạo xong công văn.
 */
export function NewCorrespondenceSheet({
  branches,
  trigger = '+ Tạo công văn',
}: {
  readonly branches: readonly Branch[];
  readonly trigger?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [v, setV] = useState<Values>({
    direction: 'INBOUND',
    branchId: branches[0]?.id ?? '',
    docType: '',
    counterparty: '',
    subject: '',
    refNo: '',
    receivedOn: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Values | 'file', string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((p) => ({ ...p, [k]: val }));
  const inbound = v.direction === 'INBOUND';

  const close = () => {
    setOpen(false);
    setStep(0);
    setError(null);
    setErrors({});
    setFile(null);
    setV((p) => ({ ...p, docType: '', counterparty: '', subject: '', refNo: '', receivedOn: '' }));
  };

  function validate(s: number) {
    const e: typeof errors = {};
    if (s === 0) {
      if (!v.branchId) e.branchId = 'Chọn chi nhánh.';
      if (!v.docType.trim()) e.docType = 'Nhập loại văn bản.';
      if (!v.counterparty.trim()) e.counterparty = inbound ? 'Nhập nơi gửi.' : 'Nhập nơi nhận.';
      if (!v.subject.trim()) e.subject = 'Nhập trích yếu.';
      if (inbound && !v.receivedOn) e.receivedOn = 'Chọn ngày nhận.';
    }
    if (s === 1 && file) {
      if (!ALLOWED.includes(file.type)) e.file = 'Chỉ nhận PDF, JPEG hoặc PNG.';
      else if (file.size > MAX_BYTES) e.file = 'Tệp tối đa 25 MB.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const next = () => validate(step) && setStep(step + 1);

  async function submit() {
    const branch = branches.find((b) => b.id === v.branchId);
    if (!branch) return setError('Chọn chi nhánh.');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/office/correspondence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          officeId: branch.officeId,
          branchId: branch.id,
          direction: v.direction,
          docType: v.docType.trim(),
          counterparty: v.counterparty.trim(),
          subject: v.subject.trim(),
          ...(inbound && v.refNo.trim() ? { refNo: v.refNo.trim() } : {}),
          ...(inbound && v.receivedOn ? { receivedOn: v.receivedOn } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string; label?: string };
      if (!res.ok) return setError(messageFor(json.code));
      if (file && json.label && UUID.test(json.label)) {
        const r = await postFile(`office/correspondence/${json.label}/attachment-files`, file, {
          role: 'FINAL_DOCUMENT',
        });
        if (!r.ok) {
          router.refresh();
          return setError(`Đã vào sổ nhưng chưa đính kèm được tệp: ${messageFor(r.code)}`);
        }
      }
      close();
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  if (branches.length === 0) return null;
  const sum: [string, string][] = [
    ['Loại', CORRESPONDENCE_DIRECTION_LABEL[v.direction] ?? v.direction],
    ['Chi nhánh', branches.find((b) => b.id === v.branchId)?.name ?? ''],
    ['Loại văn bản', v.docType],
    [inbound ? 'Nơi gửi' : 'Nơi nhận', v.counterparty],
    ['Trích yếu', v.subject],
    ...(inbound
      ? ([
          ['Số, ký hiệu', v.refNo || '—'],
          ['Ngày nhận', v.receivedOn.split('-').reverse().join('/')],
        ] as [string, string][])
      : []),
    ['Tệp đính kèm', file?.name ?? 'Không có'],
  ];

  return (
    <>
      <Button onClick={() => setOpen(true)}>{trigger}</Button>
      <Sheet
        open={open}
        onOpenChange={(o) => (o ? setOpen(true) : close())}
        title={inbound ? 'Tạo công văn đến' : 'Tạo công văn đi'}
      >
        <Stepper steps={STEPS} current={step} />
        <SheetBody>
          {step === 0 ? (
            <>
              <Field id="nc-dir" label="Loại văn bản">
                <Select
                  id="nc-dir"
                  value={v.direction}
                  onChange={(e) => set('direction', e.target.value)}
                >
                  {Object.entries(CORRESPONDENCE_DIRECTION_LABEL).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              {branches.length > 1 ? (
                <Field id="nc-branch" label="Chi nhánh" error={errors.branchId}>
                  <Select
                    id="nc-branch"
                    value={v.branchId}
                    onChange={(e) => set('branchId', e.target.value)}
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <Field
                id="nc-type"
                label="Loại văn bản (công văn, thông báo…)"
                error={errors.docType}
              >
                <Input
                  id="nc-type"
                  value={v.docType}
                  maxLength={200}
                  invalid={!!errors.docType}
                  onChange={(e) => set('docType', e.target.value)}
                />
              </Field>
              <Field
                id="nc-party"
                label={inbound ? 'Nơi gửi' : 'Nơi nhận'}
                error={errors.counterparty}
              >
                <Input
                  id="nc-party"
                  value={v.counterparty}
                  maxLength={300}
                  placeholder="Chọn hoặc nhập tên cơ quan"
                  invalid={!!errors.counterparty}
                  onChange={(e) => set('counterparty', e.target.value)}
                />
              </Field>
              <Field id="nc-subject" label="Trích yếu" error={errors.subject}>
                <Input
                  id="nc-subject"
                  value={v.subject}
                  maxLength={1000}
                  placeholder="Nội dung chính của văn bản…"
                  invalid={!!errors.subject}
                  onChange={(e) => set('subject', e.target.value)}
                />
              </Field>
              {inbound ? (
                <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
                  <Field id="nc-ref" label="Số, ký hiệu của nơi gửi">
                    <Input
                      id="nc-ref"
                      value={v.refNo}
                      maxLength={200}
                      onChange={(e) => set('refNo', e.target.value)}
                    />
                  </Field>
                  <Field id="nc-recv" label="Ngày nhận" error={errors.receivedOn}>
                    <DatePicker
                      id="nc-recv"
                      value={v.receivedOn}
                      invalid={!!errors.receivedOn}
                      onChange={(d) => set('receivedOn', d)}
                    />
                  </Field>
                </div>
              ) : (
                <p className="text-[13px] text-muted">
                  Số và ngày ban hành do Văn phòng ghi khi ban hành.
                </p>
              )}
            </>
          ) : null}
          {step === 1 ? (
            <Field
              id="nc-file"
              label="Bản scan văn bản (tuỳ chọn)"
              help="PDF, JPEG, PNG · tối đa 25 MB. Có thể đính kèm sau."
              error={errors.file}
            >
              <input
                id="nc-file"
                type="file"
                accept={ALLOWED.join(',')}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full rounded-xl border border-dashed border-line-strong bg-surface-2 p-4 text-sm"
              />
            </Field>
          ) : null}
          {step === 2 ? (
            <>
              <dl className="m-0 grid gap-0">
                {sum.map(([k, val]) => (
                  <div key={k} className="grid gap-0.5 border-b border-line py-2.5">
                    <dt className="text-xs text-muted">{k}</dt>
                    <dd className="m-0 text-sm font-semibold text-ink">{val}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-[13px] text-muted">
                Hệ thống ghi dấu thời gian và người thực hiện khi vào sổ.
              </p>
            </>
          ) : null}
          {error ? (
            <Notice tone="danger" title="Chưa vào sổ được">
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
          {step < 2 ? (
            <Button onClick={next}>Tiếp tục: {STEPS[step + 1]} →</Button>
          ) : (
            <Button onClick={() => void submit()} disabled={busy} aria-busy={busy}>
              {busy ? 'Đang lưu…' : 'Vào sổ'}
            </Button>
          )}
        </SheetFooter>
      </Sheet>
    </>
  );
}
