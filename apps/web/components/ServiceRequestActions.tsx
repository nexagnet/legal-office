'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { messageFor } from '../lib/messages';
import { Button } from './ui/button';
import { Field, Input, Textarea } from './ui/field';
import { Notice, Sheet, SheetBody, SheetFooter } from './ui/sheet';

const schema = z.object({
  agency: z.string().trim().min(1, 'Hãy nhập cơ quan yêu cầu').max(300, 'Tối đa 300 ký tự'),
  note: z.string().trim().min(1, 'Hãy ghi đã báo thế nào').max(2000, 'Tối đa 2.000 ký tự'),
});

async function post(path: string, body?: unknown) {
  const res = await fetch(`/api/service-of-documents/requests/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { code?: string };
  return { ok: res.ok, code: json.code };
}

/** Đóng yêu cầu tống đạt (Admin hoặc Trưởng VP). Máy chủ chỉ cho đóng khi mọi văn bản đã có kết cục cuối. */
export function CloseRequestButton({ requestId }: { readonly requestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function close() {
    setBusy(true);
    setError(null);
    try {
      const r = await post(`${requestId}/closure`);
      if (!r.ok) return setError(messageFor(r.code));
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-2">
      <Button onClick={close} loading={busy}>
        Đóng yêu cầu
      </Button>
      {error ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Ghi việc đã báo kết quả tống đạt cho cơ quan yêu cầu (Điều 25.2, trong 2 ngày làm việc). */
export function ReportResultSheet({ requestId }: { readonly requestId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { agency: '', note: '' },
  });
  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      const r = await post(`${requestId}/result-notices`, v);
      if (!r.ok) return setError(messageFor(r.code));
      reset();
      setOpen(false);
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    }
  });
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Báo kết quả cho cơ quan
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Báo kết quả cho cơ quan yêu cầu"
        description="Ghi lại việc đã gửi kết quả tống đạt cho cơ quan yêu cầu. Việc này đóng hạn 2 ngày làm việc của yêu cầu."
      >
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit} noValidate>
          <SheetBody>
            <Field id="rn-agency" label="Cơ quan yêu cầu" error={errors.agency?.message}>
              <Input
                id="rn-agency"
                invalid={!!errors.agency}
                maxLength={300}
                {...register('agency')}
              />
            </Field>
            <Field
              id="rn-note"
              label="Đã báo thế nào"
              help="Ví dụ: gửi văn bản kết quả bằng đường bưu điện ngày 20/10"
              error={errors.note?.message}
            >
              <Textarea
                id="rn-note"
                invalid={!!errors.note}
                maxLength={2000}
                {...register('note')}
              />
            </Field>
            {error ? (
              <Notice tone="danger" title="Chưa lưu được">
                {error}
              </Notice>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Lưu
            </Button>
          </SheetFooter>
        </form>
      </Sheet>
    </>
  );
}
