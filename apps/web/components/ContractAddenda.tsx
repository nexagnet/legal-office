'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { messageFor } from '../lib/messages';
import { postFile } from '../lib/upload';
import { Button } from './ui/button';
import { DatePicker } from './ui/date-picker';
import { Field, Select, Textarea } from './ui/field';
import { Notice, Sheet, SheetBody, SheetFooter } from './ui/sheet';

const MAX_BYTES = 25 * 1024 * 1024;
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png'];

/** Giả định nghiệp vụ (docs/architecture/contract-addenda.md): bốn loại thay đổi, không có số tiền. */
export const ADDENDUM_KIND_LABEL: Readonly<Record<string, string>> = {
  EXTEND: 'Gia hạn / điều chỉnh thời hạn',
  SCOPE: 'Bổ sung phạm vi dịch vụ',
  PARTIES: 'Thay đổi bên tham gia',
  OTHER: 'Khác',
};

interface Addendum {
  readonly id: number;
  readonly seq: number;
  readonly kind: string;
  readonly summary: string;
  readonly effectiveFrom: string;
  readonly attachmentId: number;
}

const dayVi = (d: string) => d.split('-').reverse().join('/');

const schema = z.object({
  kind: z.enum(Object.keys(ADDENDUM_KIND_LABEL) as [string, ...string[]]),
  summary: z.string().trim().min(1, 'Hãy mô tả nội dung thay đổi').max(2000, 'Tối đa 2.000 ký tự'),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Hãy chọn ngày hiệu lực'),
  file: z
    .custom<ArrayLike<File>>(
      (v) => v != null && typeof (v as ArrayLike<File>).length === 'number',
      { message: 'Hãy chọn bản scan phụ lục đã ký' },
    )
    .refine((v) => v.length > 0 && v[0]!.size > 0, 'Hãy chọn bản scan phụ lục đã ký')
    .refine((v) => v.length === 0 || ALLOWED.includes(v[0]!.type), 'Chỉ nhận PDF, JPEG hoặc PNG')
    .refine((v) => v.length === 0 || v[0]!.size <= MAX_BYTES, 'Tệp tối đa 25 MB'),
});
type Values = z.infer<typeof schema>;

/** Phụ lục của một hợp đồng: danh sách và form thêm (bản scan đã ký là bắt buộc, không nhập số tiền). */
export function ContractAddenda({
  contractId,
  active,
}: {
  readonly contractId: string;
  /** Chỉ tải khi mục chứa nó được mở. */
  readonly active: boolean;
}) {
  const base = `/api/vibang/contracts/${contractId}`;
  const [items, setItems] = useState<readonly Addendum[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { kind: 'EXTEND', summary: '', effectiveFrom: '' },
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${base}/addenda`);
      const body: unknown = res.ok ? await res.json() : [];
      setItems(
        Array.isArray(body) ? (body as Addendum[]).filter((a) => typeof a?.seq === 'number') : [],
      );
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    }
  }, [base]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const close = () => {
    setOpen(false);
    setError(null);
    reset();
  };

  const onSubmit = async (v: Values) => {
    setError(null);
    try {
      const r = await postFile(`vibang/contracts/${contractId}/addendum-files`, v.file[0]!, {
        kind: v.kind,
        effectiveFrom: v.effectiveFrom,
        summary: v.summary,
        name: v.file[0]!.name,
      });
      if (!r.ok) return setError(messageFor(r.code));
      close();
      await load();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    }
  };

  return (
    <div className="contract-addenda">
      <h3>Phụ lục</h3>
      {items.length === 0 ? (
        <p>Chưa có phụ lục.</p>
      ) : (
        <ul>
          {items.map((a) => (
            <li key={a.id}>
              <strong>Phụ lục {a.seq}</strong> · {ADDENDUM_KIND_LABEL[a.kind] ?? a.kind} · hiệu lực{' '}
              {dayVi(a.effectiveFrom)}
              <br />
              <span className="muted">{a.summary}</span>{' '}
              <a href={`${base}/attachments/${a.attachmentId}`}>Bản scan</a>
            </li>
          ))}
        </ul>
      )}
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Thêm phụ lục hợp đồng
      </Button>
      <Sheet
        open={open}
        onOpenChange={(o) => (o ? setOpen(true) : close())}
        title="Thêm phụ lục hợp đồng"
        description="Không nhập số tiền kế toán trong hệ thống"
      >
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit(onSubmit)} noValidate>
          <SheetBody>
            <Field id="addendum-kind" label="Loại thay đổi" error={errors.kind?.message}>
              <Select id="addendum-kind" invalid={!!errors.kind} {...register('kind')}>
                {Object.entries(ADDENDUM_KIND_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="addendum-date" label="Ngày hiệu lực" error={errors.effectiveFrom?.message}>
              <Controller
                control={control}
                name="effectiveFrom"
                render={({ field }) => (
                  <DatePicker
                    id="addendum-date"
                    value={field.value}
                    onChange={field.onChange}
                    invalid={!!errors.effectiveFrom}
                  />
                )}
              />
            </Field>
            <Field
              id="addendum-summary"
              label="Nội dung thay đổi"
              help="Mô tả ngắn điều khoản được sửa đổi, bổ sung"
              error={errors.summary?.message}
            >
              <Textarea
                id="addendum-summary"
                invalid={!!errors.summary}
                maxLength={2000}
                {...register('summary')}
              />
            </Field>
            <Field
              id="addendum-file"
              label="Tệp phụ lục đã ký"
              help="PDF, JPEG, PNG · tối đa 25 MB · bắt buộc để lưu"
              error={errors.file?.message}
            >
              <input
                id="addendum-file"
                type="file"
                accept={ALLOWED.join(',')}
                aria-invalid={!!errors.file || undefined}
                className="block w-full rounded-xl border border-dashed border-line-strong bg-surface-2 p-4 text-sm"
                {...register('file')}
              />
            </Field>
            {error ? (
              <Notice tone="danger" title="Chưa lưu được phụ lục">
                {error}
              </Notice>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button variant="ghost" onClick={close}>
              Huỷ
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Lưu phụ lục
            </Button>
          </SheetFooter>
        </form>
      </Sheet>
    </div>
  );
}
