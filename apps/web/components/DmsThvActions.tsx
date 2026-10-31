'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { DmsThvOption } from '../lib/dms';
import { messageFor } from '../lib/messages';

async function send(method: string, url: string, body?: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.ok) return null;
    const json = (await res.json().catch(() => ({}))) as { code?: string };
    return messageFor(json.code);
  } catch {
    return 'Không kết nối được máy chủ. Vui lòng thử lại.';
  }
}

/** Ghi tên thừa hành viên trên BẢN NHÁP. Ghi tên chưa đủ: chính THV đó phải tự xác nhận trước khi ghi sổ. */
export function DmsThvPicker({
  caseId,
  options,
  currentId,
  confirmed,
}: {
  readonly caseId: string;
  readonly options: readonly DmsThvOption[];
  readonly currentId: string | null;
  readonly confirmed: boolean | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = String(new FormData(e.currentTarget).get('thv') ?? '');
    setBusy(true);
    setError(await send('PUT', `/api/dms/cases/${caseId}/thv`, { thvUserId: v === '' ? null : v }));
    setBusy(false);
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className="mb-4 flex flex-wrap items-end gap-3"
      aria-label="Thừa hành viên được ghi tên"
    >
      <label className="flex flex-col gap-1 text-sm">
        Thừa hành viên được ghi tên
        <select name="thv" defaultValue={currentId ?? ''}>
          <option value="">Không ghi tên</option>
          {options.map((o) => (
            <option key={o.userId} value={o.userId}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={busy}>
        Lưu
      </button>
      {currentId ? (
        <span className="chip" data-tone={confirmed ? 'ok' : 'warn'}>
          {confirmed ? 'THV đã xác nhận' : 'Chờ THV xác nhận'}
        </span>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}

/** THV bấm xác nhận nội dung đang xem. */
export function DmsThvConfirmButton({
  caseId,
  confirmed,
}: {
  readonly caseId: string;
  readonly confirmed: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (confirmed) return <p role="status">Bạn đã xác nhận nội dung này.</p>;
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(await send('POST', `/api/dms/thv/cases/${caseId}/confirm`));
          setBusy(false);
          router.refresh();
        }}
      >
        Tôi xác nhận nội dung này
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
