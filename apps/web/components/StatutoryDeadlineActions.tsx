'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { messageFor } from '../lib/messages';
import { Button } from './ui/button';
import { DatePicker } from './ui/date-picker';
import { Field, Input, Textarea } from './ui/field';
import { Notice, Sheet, SheetBody, SheetFooter } from './ui/sheet';

type Mode = 'done' | 'agree';

const doneSchema = z.object({
  note: z.string().trim().min(1, 'Hãy ghi đã làm gì').max(2000, 'Tối đa 2.000 ký tự'),
});
const agreeSchema = z.object({
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Hãy chọn hạn thỏa thuận mới'),
  reason: z
    .string()
    .trim()
    .min(1, 'Hãy ghi các bên thỏa thuận thế nào')
    .max(2000, 'Tối đa 2.000 ký tự'),
});

async function post(path: string, body: unknown) {
  const res = await fetch(`/api/office/deadlines/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { code?: string };
  return { ok: res.ok, code: json.code };
}

/**
 * Hạn pháp định: ghi đã làm xong (kèm ghi chú) hoặc ghi hạn thỏa thuận khác (kèm lý do).
 * Quyền do máy chủ kiểm; người không đủ quyền nhận thông báo lỗi tiếng Việt.
 */
export function StatutoryDeadlineActions({ id }: { readonly id: string }) {
  const [mode, setMode] = useState<Mode | null>(null);
  return (
    <span className="deadline-actions inline-flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => setMode('done')}>
        Đã làm xong
      </Button>
      <Button variant="ghost" onClick={() => setMode('agree')}>
        Ghi hạn thỏa thuận
      </Button>
      <Sheet
        open={mode === 'done'}
        onOpenChange={(o) => !o && setMode(null)}
        title="Ghi nhận đã làm xong"
        description="Ghi lại việc đã thực hiện để đóng hạn pháp định này."
      >
        <DoneForm id={id} onClose={() => setMode(null)} />
      </Sheet>
      <Sheet
        open={mode === 'agree'}
        onOpenChange={(o) => !o && setMode(null)}
        title="Ghi hạn thỏa thuận khác"
        description="Chỉ dùng khi các bên đã thỏa thuận hạn khác với hạn theo luật."
      >
        <AgreeForm id={id} onClose={() => setMode(null)} />
      </Sheet>
    </span>
  );
}

function useSubmit(onClose: () => void) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<{ ok: boolean; code?: string }>) => {
    setError(null);
    try {
      const r = await action();
      if (!r.ok) return setError(messageFor(r.code));
      onClose();
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    }
  };
  return { error, run };
}

function DoneForm({ id, onClose }: { readonly id: string; readonly onClose: () => void }) {
  const { error, run } = useSubmit(onClose);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof doneSchema>>({ resolver: zodResolver(doneSchema) });
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={handleSubmit((v) => run(() => post(`${id}/done`, { note: v.note })))}
      noValidate
    >
      <SheetBody>
        <Field
          id="deadline-note"
          label="Đã làm gì"
          help="Ví dụ: gửi kết quả cho Tòa án ngày 20/10"
          error={errors.note?.message}
        >
          <Textarea
            id="deadline-note"
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
        <Button variant="ghost" onClick={onClose}>
          Huỷ
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          Lưu
        </Button>
      </SheetFooter>
    </form>
  );
}

function AgreeForm({ id, onClose }: { readonly id: string; readonly onClose: () => void }) {
  const { error, run } = useSubmit(onClose);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof agreeSchema>>({
    resolver: zodResolver(agreeSchema),
    defaultValues: { due: '', reason: '' },
  });
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={handleSubmit((v) =>
        run(() => post(`${id}/agree`, { dueAt: `${v.due}T23:59:59+07:00`, reason: v.reason })),
      )}
      noValidate
    >
      <SheetBody>
        <Notice tone="warn" title="Chỉ dùng khi các bên thỏa thuận">
          Hạn gốc theo luật vẫn được lưu. Ghi nhận này thay hạn hiển thị và để lại dấu vết kiểm
          toán.
        </Notice>
        <Field
          id="deadline-due"
          label="Hạn thỏa thuận mới"
          help="Định dạng dd/MM/yyyy · tính đến 23:59 giờ Việt Nam"
          error={errors.due?.message}
        >
          <Controller
            control={control}
            name="due"
            render={({ field }) => (
              <DatePicker
                id="deadline-due"
                value={field.value}
                onChange={field.onChange}
                invalid={!!errors.due}
              />
            )}
          />
        </Field>
        <Field
          id="deadline-reason"
          label="Lý do (các bên thỏa thuận thế nào)"
          help="Tối đa 2.000 ký tự · bắt buộc"
          error={errors.reason?.message}
        >
          <Input
            id="deadline-reason"
            invalid={!!errors.reason}
            maxLength={2000}
            {...register('reason')}
          />
        </Field>
        {error ? (
          <Notice tone="danger" title="Chưa lưu được">
            {error}
          </Notice>
        ) : null}
      </SheetBody>
      <SheetFooter>
        <Button variant="ghost" onClick={onClose}>
          Huỷ
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          Lưu
        </Button>
      </SheetFooter>
    </form>
  );
}
