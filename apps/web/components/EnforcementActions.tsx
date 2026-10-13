'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PARTY_KIND_LABEL, PARTY_ROLE_LABEL, RESULT_KIND_LABEL, messageFor } from '../lib/messages';
import { pickedFile, postFile } from '../lib/upload';

interface Props {
  readonly caseId: string;
  readonly status: string;
  readonly obligations: readonly {
    readonly id: string;
    readonly seq: number;
    readonly description: string;
  }[];
}

async function post(path: string, body: unknown) {
  const res = await fetch(`/api/enforcement-cases/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { code?: string };
  return { ok: res.ok, code: json.code };
}

/**
 * Thêm đương sự, nghĩa vụ, ghi chú diễn biến, ghi kết quả kèm tệp chứng cứ và hoàn tất hồ sơ (Admin/Trưởng VP, kèm tệp).
 * Mỗi lần ghi mang khoá chống trùng riêng để bấm lại không tạo bản sao.
 */
export function EnforcementActions({ caseId, status, obligations }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (status === 'COMPLETED') return <span className="muted">Đã hoàn tất</span>;

  async function run(
    action: () => Promise<{ ok: boolean; code?: string }>,
    reset?: HTMLFormElement,
  ) {
    setBusy(true);
    setError(null);
    try {
      const r = await action();
      if (!r.ok) return setError(messageFor(r.code));
      reset?.reset();
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }
  const data = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    return new FormData(e.currentTarget);
  };

  return (
    <div className="stack">
      <form
        className="form"
        onSubmit={(e) => {
          const form = e.currentTarget;
          const f = data(e);
          void run(
            () =>
              post(`${caseId}/parties`, {
                displayName: String(f.get('displayName') ?? ''),
                kind: String(f.get('kind')),
                role: String(f.get('role')),
              }),
            form,
          );
        }}
      >
        <label>
          Tên đương sự
          <input name="displayName" required maxLength={300} />
        </label>
        <label>
          Loại
          <select name="kind" defaultValue="PERSON">
            {Object.entries(PARTY_KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Vai trò
          <select name="role" defaultValue="DEBTOR">
            {Object.entries(PARTY_ROLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy}>
          Thêm đương sự
        </button>
      </form>
      <form
        className="form"
        onSubmit={(e) => {
          const form = e.currentTarget;
          const f = data(e);
          void run(
            () =>
              post(`${caseId}/obligations`, { description: String(f.get('description') ?? '') }),
            form,
          );
        }}
      >
        <label>
          Nghĩa vụ
          <input name="description" required maxLength={2000} />
        </label>
        <button type="submit" disabled={busy}>
          Thêm nghĩa vụ
        </button>
      </form>
      {obligations.length > 0 ? (
        <form
          className="form"
          onSubmit={(e) => {
            const form = e.currentTarget;
            const f = data(e);
            void run(
              () =>
                post(`obligations/${String(f.get('obligationId'))}/events`, {
                  kind: 'NOTE',
                  note: String(f.get('note') ?? ''),
                  idempotencyKey: crypto.randomUUID(),
                }),
              form,
            );
          }}
        >
          <label>
            Nghĩa vụ cần ghi chú
            <select name="obligationId" defaultValue={obligations[0]?.id}>
              {obligations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.seq}. {o.description}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ghi chú diễn biến
            <input name="note" required maxLength={4000} />
          </label>
          <button type="submit" disabled={busy}>
            Ghi chú
          </button>
        </form>
      ) : null}
      {obligations.length > 0 ? (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const file = pickedFile(form, 'file');
            if (!file) return setError(messageFor('INVALID_DOCUMENT'));
            const f = new FormData(form);
            void run(
              () =>
                postFile(
                  `enforcement-cases/obligations/${String(f.get('obligationId'))}/event-files`,
                  file,
                  {
                    kind: String(f.get('kind')),
                    note: String(f.get('note') ?? ''),
                    idempotencyKey: crypto.randomUUID(),
                  },
                ),
              form,
            );
          }}
        >
          <label>
            Nghĩa vụ có kết quả
            <select name="obligationId" defaultValue={obligations[0]?.id}>
              {obligations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.seq}. {o.description}
                </option>
              ))}
            </select>
          </label>
          <label>
            Loại kết quả
            <select name="kind" defaultValue="PARTIAL_RESULT">
              {Object.entries(RESULT_KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nội dung kết quả
            <input name="note" required maxLength={4000} />
          </label>
          <label>
            Tệp chứng cứ (PDF, JPEG, PNG; tối đa 25 MB)
            <input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required />
          </label>
          <button type="submit" disabled={busy}>
            Ghi kết quả kèm chứng cứ
          </button>
        </form>
      ) : null}
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const file = pickedFile(form, 'completion');
          if (!file) return setError(messageFor('INVALID_DOCUMENT'));
          void run(() => postFile(`enforcement-cases/${caseId}/completion-file`, file));
        }}
      >
        <label>
          Tệp chứng cứ hoàn tất hồ sơ (PDF, JPEG, PNG; tối đa 25 MB)
          <input
            name="completion"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            required
          />
        </label>
        <button type="submit" disabled={busy}>
          Hoàn tất hồ sơ
        </button>
      </form>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
    </div>
  );
}
