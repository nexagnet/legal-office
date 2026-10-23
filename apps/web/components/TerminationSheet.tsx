'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { TERMINATION_REASON_LABEL, messageFor } from '../lib/messages';
import { postFile } from '../lib/upload';
import { Button } from './ui/button';
import { Field, Input, Select } from './ui/field';
import { Notice, Sheet, SheetBody, SheetFooter } from './ui/sheet';

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];

const schema = z.object({
  reason: z.enum(Object.keys(TERMINATION_REASON_LABEL) as [string, ...string[]]),
  basis: z.string().trim().min(1, 'Hãy ghi căn cứ pháp lý').max(2000, 'Tối đa 2.000 ký tự'),
  file: z
    .custom<ArrayLike<File>>(
      (v) => v != null && typeof (v as ArrayLike<File>).length === 'number',
      {
        message: 'Hãy chọn văn bản chấm dứt',
      },
    )
    .refine((v) => v.length > 0 && v[0]!.size > 0, 'Hãy chọn văn bản chấm dứt')
    .refine((v) => v.length === 0 || ALLOWED.includes(v[0]!.type), 'Chỉ nhận PDF, JPEG hoặc PNG')
    .refine((v) => v.length === 0 || v[0]!.size <= MAX_BYTES, 'Tệp tối đa 25 MB'),
});
type Values = z.infer<typeof schema>;

/** Chấm dứt tổ chức thi hành án (Điều 46): lý do, căn cứ, văn bản kèm theo; không hoàn tác. */
export function TerminationSheet({ caseId }: { readonly caseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { reason: 'AGREEMENT', basis: '' },
  });

  const close = () => {
    setOpen(false);
    setError(null);
    reset();
  };

  const onSubmit = async (v: Values) => {
    setError(null);
    try {
      const r = await postFile(`enforcement-cases/${caseId}/termination-file`, v.file[0]!, {
        reason: v.reason,
        basis: v.basis,
      });
      if (!r.ok) return setError(messageFor(r.code));
      close();
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    }
  };

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Chấm dứt hồ sơ
      </Button>
      <Sheet
        open={open}
        onOpenChange={(o) => (o ? setOpen(true) : close())}
        title="Chấm dứt tổ chức thi hành án"
        description="Điều 46 · không hoàn tác"
      >
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit(onSubmit)} noValidate>
          <SheetBody>
            <Notice tone="danger" title="Hành động này đóng hồ sơ">
              Hồ sơ chuyển sang “Đã chấm dứt”; không ghi thêm kết quả hay tài sản. Văn bản chấm dứt
              được lưu kèm.
            </Notice>
            <Field id="term-reason" label="Lý do chấm dứt" error={errors.reason?.message}>
              <Select id="term-reason" invalid={!!errors.reason} {...register('reason')}>
                {Object.entries(TERMINATION_REASON_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              id="term-basis"
              label="Căn cứ pháp lý"
              help="Điểm, khoản, Điều của Luật THADS hoặc thỏa thuận"
              error={errors.basis?.message}
            >
              <Input
                id="term-basis"
                invalid={!!errors.basis}
                maxLength={2000}
                {...register('basis')}
              />
            </Field>
            <Field
              id="term-file"
              label="Văn bản chấm dứt / thanh lý hợp đồng"
              help="PDF, JPEG, PNG · tối đa 25 MB"
              error={errors.file?.message}
            >
              <input
                id="term-file"
                type="file"
                accept={ALLOWED.join(',')}
                aria-invalid={!!errors.file || undefined}
                className="block w-full rounded-xl border border-dashed border-line-strong bg-surface-2 p-4 text-sm"
                {...register('file')}
              />
            </Field>
            {error ? (
              <Notice tone="danger" title="Chưa chấm dứt được">
                {error}
              </Notice>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button variant="ghost" onClick={close}>
              Huỷ
            </Button>
            <Button variant="danger" type="submit" disabled={isSubmitting}>
              Chấm dứt hồ sơ
            </Button>
          </SheetFooter>
        </form>
      </Sheet>
    </>
  );
}
