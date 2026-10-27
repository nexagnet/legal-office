'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { formatDay, type OfficeCalendar } from '../lib/deadlines';
import { messageFor } from '../lib/messages';

const WEEKDAYS: readonly (readonly [number, string])[] = [
  [1, 'Thứ Hai'],
  [2, 'Thứ Ba'],
  [3, 'Thứ Tư'],
  [4, 'Thứ Năm'],
  [5, 'Thứ Sáu'],
  [6, 'Thứ Bảy'],
  [7, 'Chủ nhật'],
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
    <section className="calendar-settings" aria-labelledby="cal-t">
      <h2 id="cal-t">Lịch làm việc</h2>
      <p className="muted">
        Hạn chỉ là nhắc việc, không thay đổi trạng thái hồ sơ. Thứ Bảy mặc định không phải ngày làm
        việc.
      </p>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
      <p role="status" className="success" hidden={!notice}>
        {notice}
      </p>
      <div className="calendar-grid">
        <div className="card form">
          <h3>Ngày làm việc trong tuần</h3>
          <fieldset className="weekdays" disabled={!canEdit || busy}>
            <legend className="sr-only">Ngày làm việc trong tuần</legend>
            {WEEKDAYS.map(([n, label]) => (
              <label key={n} className="check">
                <input type="checkbox" checked={weekdays.includes(n)} onChange={() => toggle(n)} />
                {label}
              </label>
            ))}
          </fieldset>
          {canEdit ? (
            <button
              type="button"
              className="primary"
              disabled={busy || weekdays.length === 0}
              onClick={saveWeekdays}
            >
              Lưu ngày làm việc
            </button>
          ) : (
            <p className="muted">Chỉ Admin được đổi ngày làm việc.</p>
          )}
        </div>
        <div className="card form">
          <h3>Ngày nghỉ và ngày lễ</h3>
          {holidays.length === 0 ? (
            <p className="muted">Chưa có ngày nghỉ nào được khai báo.</p>
          ) : (
            <ul className="rows holiday-rows">
              {holidays.map((h) => (
                <li key={h.day}>
                  <span>
                    <strong>{formatDay(`${h.day}T00:00:00+07:00`)}</strong>
                    <span className="muted"> · {h.label}</span>
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
          {canEdit ? (
            <form onSubmit={addHoliday} aria-label="Thêm ngày nghỉ">
              <label>
                Ngày nghỉ
                <input name="day" type="date" required />
              </label>
              <label>
                Tên ngày nghỉ
                <input name="label" required maxLength={200} />
              </label>
              <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
                Thêm ngày nghỉ
              </button>
            </form>
          ) : null}
        </div>
        <form className="card form" onSubmit={compute} aria-labelledby="calc-t">
          <h3 id="calc-t">Tính thử hạn</h3>
          <label>
            Từ ngày
            <input name="from" type="date" required />
          </label>
          <label>
            Số ngày làm việc
            <input name="days" type="number" min={0} max={366} step={1} required defaultValue={5} />
          </label>
          <button type="submit" className="primary">
            Tính hạn
          </button>
          <p role="status" className="success" hidden={!computed}>
            Hạn dự kiến: {computed ? formatDay(`${computed}T00:00:00+07:00`) : ''}
          </p>
          <p role="alert" className="error" hidden={!computeError}>
            {computeError}
          </p>
        </form>
      </div>
    </section>
  );
}
