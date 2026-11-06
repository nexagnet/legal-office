'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { formatDay, type OfficeCalendar } from '../lib/deadlines';
import { cn } from '../lib/cn';
import { messageFor } from '../lib/messages';
import { Button } from './ui/button';
import { Modal } from './ui/dialog';
import { Field, Input } from './ui/field';

const WEEKDAYS: readonly (readonly [number, string, string])[] = [
  [1, 'Thứ Hai', 'Thứ 2'],
  [2, 'Thứ Ba', 'Thứ 3'],
  [3, 'Thứ Tư', 'Thứ 4'],
  [4, 'Thứ Năm', 'Thứ 5'],
  [5, 'Thứ Sáu', 'Thứ 6'],
  [6, 'Thứ Bảy', 'Thứ 7'],
  [7, 'Chủ nhật', 'CN'],
];

type Holiday = OfficeCalendar['holidays'][number];

async function call(
  url: string,
  method: 'GET' | 'POST' | 'PUT',
  body?: unknown,
): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  const res = await fetch(url, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, json };
}

const NETWORK_ERROR = 'Không kết nối được máy chủ. Vui lòng thử lại.';
const sortHolidays = (h: readonly Holiday[]) => [...h].sort((a, b) => a.day.localeCompare(b.day));

/** Lịch làm việc của văn phòng: ngày làm việc trong tuần, ngày nghỉ/lễ, tính thử hạn. */
export function CalendarSettings({
  officeId,
  calendar,
  canEdit,
}: {
  readonly officeId: string;
  readonly calendar: OfficeCalendar;
  readonly canEdit: boolean;
}) {
  const router = useRouter();
  const [weekdays, setWeekdays] = useState<readonly number[]>(calendar.workingWeekdays);
  const [holidays, setHolidays] = useState<readonly Holiday[]>(sortHolidays(calendar.holidays));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [computed, setComputed] = useState<string | null>(null);
  const [computeError, setComputeError] = useState<string | null>(null);

  async function run(action: () => Promise<{ notice?: string; error?: string }>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      if (result.error) setError(result.error);
      if (result.notice) setNotice(result.notice);
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (n: number) =>
    setWeekdays((cur) => (cur.includes(n) ? cur.filter((d) => d !== n) : [...cur, n].sort()));

  const saveWeekdays = () =>
    run(async () => {
      const { ok, json } = await call('/api/office/calendar/weekdays', 'PUT', {
        officeId,
        weekdays: [...weekdays].sort(),
      });
      if (!ok) return { error: messageFor(json.code as string | undefined) };
      router.refresh();
      return { notice: 'Đã lưu ngày làm việc.' };
    });

  const addHoliday = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const day = String(f.get('day') ?? '');
    const label = String(f.get('label') ?? '').trim();
    return run(async () => {
      const { ok, json } = await call('/api/office/calendar/holidays', 'POST', {
        officeId,
        day,
        label,
      });
      if (!ok) return { error: messageFor(json.code as string | undefined) };
      setHolidays((cur) => sortHolidays([...cur.filter((h) => h.day !== day), { day, label }]));
      form.reset();
      setAdding(false);
      router.refresh();
      return { notice: 'Đã thêm ngày nghỉ.' };
    });
  };

  const removeHoliday = (day: string) =>
    run(async () => {
      const { ok, json } = await call('/api/office/calendar/holidays/remove', 'POST', {
        officeId,
        day,
      });
      if (!ok) return { error: messageFor(json.code as string | undefined) };
      setHolidays((cur) => cur.filter((h) => h.day !== day));
      router.refresh();
      return { notice: 'Đã xoá ngày nghỉ.' };
    });

  async function compute(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const qs = new URLSearchParams({
      officeId,
      from: String(f.get('from') ?? ''),
      days: String(f.get('days') ?? ''),
    });
    setComputed(null);
    setComputeError(null);
    try {
      const { ok, json } = await call(`/api/office/deadlines/compute?${qs}`, 'GET');
      if (!ok) return setComputeError('Không tính được hạn. Kiểm tra ngày bắt đầu và số ngày.');
      setComputed(String(json.dueDate));
    } catch {
      setComputeError(NETWORK_ERROR);
    }
  }

  return (
    <section className="grid gap-4" aria-labelledby="cal-t">
      <h2 id="cal-t" className="sr-only">
        Lịch làm việc
      </h2>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
      <p role="status" className="success" hidden={!notice}>
        {notice}
      </p>
      <div className="grid gap-3 rounded-2xl bg-surface p-6 shadow-sm">
        <h3 className="font-serif text-lg">Ngày làm việc trong tuần</h3>
        <fieldset className="flex flex-wrap gap-3 border-0 p-0" disabled={!canEdit || busy}>
          <legend className="sr-only">Ngày làm việc trong tuần</legend>
          {WEEKDAYS.map(([n, , short]) => {
            const on = weekdays.includes(n);
            return (
              <button
                key={n}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(n)}
                className={cn(
                  'min-h-11 min-w-20 flex-1 rounded-[10px] border px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed',
                  on
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line-strong bg-surface text-muted hover:bg-surface-2',
                )}
              >
                {short}
              </button>
            );
          })}
        </fieldset>
        {!canEdit ? <p className="muted">Chỉ Admin được đổi ngày làm việc.</p> : null}
      </div>

      <div className="grid gap-2 rounded-2xl bg-surface p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-serif text-lg">Ngày nghỉ</h3>
          {canEdit ? (
            <Button variant="secondary" onClick={() => setAdding(true)} disabled={busy}>
              + Thêm ngày nghỉ
            </Button>
          ) : null}
        </div>
        {holidays.length === 0 ? (
          <p className="muted">Chưa có ngày nghỉ nào được khai báo.</p>
        ) : (
          <ul className="m-0 grid list-none p-0">
            {holidays.map((h) => (
              <li
                key={h.day}
                className="flex items-center justify-between gap-3 border-t border-line py-4 text-sm"
              >
                <span>
                  <strong>{formatDay(`${h.day}T00:00:00+07:00`)}</strong>
                  <span className="text-muted"> {h.label}</span>
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    className="link-btn"
                    disabled={busy}
                    aria-busy={busy}
                    aria-label={`Xoá ngày nghỉ ${h.label}`}
                    onClick={() => removeHoliday(h.day)}
                  >
                    Xoá
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canEdit ? (
        <div className="flex justify-end">
          <Button disabled={busy || weekdays.length === 0} onClick={saveWeekdays}>
            Lưu lịch
          </Button>
        </div>
      ) : null}

      <form
        className="grid gap-3 rounded-2xl bg-surface p-6 shadow-sm sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={compute}
        aria-labelledby="calc-t"
      >
        <h3 id="calc-t" className="font-serif text-lg sm:col-span-3">
          Tính thử hạn
        </h3>
        <Field id="cal-from" label="Từ ngày">
          <Input id="cal-from" name="from" type="date" required />
        </Field>
        <Field id="cal-days" label="Số ngày làm việc">
          <Input
            id="cal-days"
            name="days"
            type="number"
            min={0}
            max={366}
            step={1}
            required
            defaultValue={5}
          />
        </Field>
        <Button type="submit">Tính hạn</Button>
        <p role="status" className="success sm:col-span-3" hidden={!computed}>
          Hạn dự kiến: {computed ? formatDay(`${computed}T00:00:00+07:00`) : ''}
        </p>
        <p role="alert" className="error sm:col-span-3" hidden={!computeError}>
          {computeError}
        </p>
      </form>

      <Modal
        open={adding}
        onOpenChange={setAdding}
        title="Thêm ngày nghỉ"
        description="Ngày nghỉ được loại khỏi ngày làm việc khi tính hạn pháp định và nhắc việc."
      >
        <form onSubmit={addHoliday} aria-label="Thêm ngày nghỉ" className="grid gap-4">
          <Field id="hol-day" label="Ngày nghỉ">
            <Input id="hol-day" name="day" type="date" required />
          </Field>
          <Field id="hol-label" label="Tên ngày nghỉ">
            <Input id="hol-label" name="label" required maxLength={200} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={busy} aria-busy={busy}>
              Thêm ngày nghỉ
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
