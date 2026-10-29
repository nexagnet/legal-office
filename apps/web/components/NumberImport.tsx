'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFor } from '../lib/messages';
import { Button } from './ui/button';
import { Field, Input } from './ui/field';
import { Notice, Sheet, SheetBody, SheetFooter } from './ui/sheet';

/**
 * Nhập số cuối của sổ giấy cho một năm (Figma N16 O12). Chỉ Admin; chỉ tiến, không lùi; mỗi lần nhập được ghi lại.
 * Dùng khi văn phòng chuyển từ sổ giấy sang hệ thống để số Vi bằng tiếp nối đúng dãy.
 */
export function NumberImport({
  officeId,
  year,
  label,
}: {
  readonly officeId: string;
  readonly year: number;
  readonly label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const n = Number(last);
    if (last.trim() === '' || !Number.isInteger(n) || n < 0)
      return setError('Nhập số cuối là số nguyên không âm.');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/vibang/offices/${officeId}/number-imports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ year, lastNumber: n }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setError(messageFor(json.code));
      setOpen(false);
      setLast('');
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          setError(null);
        }}
        title={`Nhập số cuối sổ giấy · ${year}`}
        description="Số Vi bằng tiếp theo sẽ là số cuối cộng một. Chỉ tăng, không giảm; mỗi lần nhập được ghi lại."
      >
        <SheetBody>
          <Field
            id="ni-last"
            label="Số cuối đã dùng trên sổ giấy"
            help="Ví dụ: 120 thì số kế tiếp là 121."
          >
            <Input
              id="ni-last"
              type="number"
              min={0}
              inputMode="numeric"
              value={last}
              onChange={(e) => setLast(e.target.value)}
            />
          </Field>
          <Notice tone="warn" title="Cần đối chiếu sổ giấy thật">
            Chỉ nhập sau khi đã đối chiếu với sổ giấy của văn phòng.
          </Notice>
          {error ? (
            <Notice tone="danger" title="Chưa lưu được">
              {error}
            </Notice>
          ) : null}
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Huỷ
          </Button>
          <Button type="button" loading={busy} onClick={() => void submit()}>
            Lưu số cuối
          </Button>
        </SheetFooter>
      </Sheet>
    </>
  );
}
