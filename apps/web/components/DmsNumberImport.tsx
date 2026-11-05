'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFor } from '../lib/messages';
import { Button } from './ui/button';
import { Input } from './ui/field';
import { Notice } from './ui/sheet';

export interface NumberRow {
  readonly kind: string;
  readonly lastValue: number;
  readonly importedValue: number | null;
  readonly importedAt: string | null;
}

/** Nhãn từng bộ đếm. Tống đạt có hai bộ đếm riêng: STT sổ S-01 (mỗi giấy tờ) và số hồ sơ (mỗi hồ sơ). */
export const KIND_LABEL: Readonly<Record<string, string>> = {
  'S-01': 'Sổ Tống đạt (S-01) · STT giấy tờ',
  'CASE-TD': 'Tống đạt · số hồ sơ',
  'S-02': 'Sổ Vi bằng (S-02)',
  'S-04': 'Sổ Xác minh điều kiện THA (S-04)',
  'S-05': 'Sổ Tổ chức THA (S-05)',
};
const ORDER = ['S-01', 'CASE-TD', 'S-02', 'S-04', 'S-05'];

const day = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });

/**
 * Nhập số cuối của sổ giấy cho từng sổ DMS trong một năm. Chỉ Admin; chỉ tiến, không lùi; mỗi lần nhập được ghi lại.
 * Nhập số ĐÃ DÙNG cuối cùng: hệ thống cấp số kế tiếp là số đó cộng một.
 */
export function DmsNumberImport({
  officeId,
  year,
  rows,
}: {
  readonly officeId: string;
  readonly year: number;
  readonly rows: readonly NumberRow[];
}) {
  const sorted = [...rows].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  return (
    <div>
      <p className="muted">
        Nhập số <strong>đã dùng cuối cùng</strong> trên sổ giấy (ví dụ 120 thì số kế tiếp là 121).
        Chỉ tăng, không giảm; mỗi lần nhập được ghi lại.
      </p>
      <Notice tone="warn" title="Cần đối chiếu sổ giấy thật">
        Chỉ nhập sau khi đã đối chiếu với sổ giấy của văn phòng.
      </Notice>
      <ul className="mt-3">
        {sorted.map((r) => (
          <NumberRowForm key={r.kind} officeId={officeId} year={year} row={r} />
        ))}
      </ul>
    </div>
  );
}

function NumberRowForm({
  officeId,
  year,
  row,
}: {
  readonly officeId: string;
  readonly year: number;
  readonly row: NumberRow;
}) {
  const router = useRouter();
  const [last, setLast] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const label = KIND_LABEL[row.kind] ?? row.kind;
  const inputId = `ni-${row.kind}`;

  async function submit() {
    const n = Number(last);
    setSaved(false);
    if (last.trim() === '' || !Number.isInteger(n) || n < 0)
      return setError('Nhập số cuối là số nguyên không âm.');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/dms/number-imports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ officeId, kind: row.kind, year, lastNumber: n }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setError(messageFor(json.code));
      setLast('');
      setSaved(true);
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="mb-3">
      <label htmlFor={inputId}>
        <strong>{label}</strong> · {year}
      </label>
      <p className="muted">
        Số đang dùng: <strong>{row.lastValue}</strong>; số kế tiếp là{' '}
        <strong>{row.lastValue + 1}</strong>.
        {row.importedValue !== null
          ? ` Lần nhập gần nhất: ${row.importedValue}${
              row.importedAt ? ` (ngày ${day.format(new Date(row.importedAt))})` : ''
            }.`
          : ' Chưa nhập số cuối sổ giấy.'}
      </p>
      <div className="flex gap-2">
        <Input
          id={inputId}
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="Số cuối đã dùng"
          value={last}
          onChange={(e) => setLast(e.target.value)}
        />
        <Button type="button" variant="secondary" loading={busy} onClick={() => void submit()}>
          Lưu số cuối
        </Button>
      </div>
      {error ? (
        <Notice tone="danger" title="Chưa lưu được">
          {error}
        </Notice>
      ) : null}
      {saved ? <p role="status">Đã lưu số cuối {label}.</p> : null}
    </li>
  );
}
