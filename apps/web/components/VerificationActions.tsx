'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { SOURCE_CONFIDENTIALITY_LABEL, messageFor } from '../lib/messages';
import { pickedFile, postFile } from '../lib/upload';

interface Props {
  readonly caseId: string;
  readonly status: string;
  readonly rounds: readonly {
    readonly id: string;
    readonly seq: number;
    readonly partyName: string;
    readonly status: string;
  }[];
}

async function post(path: string, body: unknown) {
  const res = await fetch(`/api/verification/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { code?: string };
  return { ok: res.ok, code: json.code };
}

/**
 * Thao tác trên một hồ sơ xác minh: bắt đầu vòng, đề xuất kết luận (THV), quyết định kết luận (Admin/Trưởng VP có quyền ký,
 * khác người đề xuất). Mỗi vòng cần ít nhất một nguồn kèm tệp (PDF/JPEG/PNG) trước khi hoàn thành.
 */
export function VerificationActions({ caseId, status, rounds }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (status === 'CONCLUDED') return <span className="muted">Đã kết luận</span>;

  async function run(action: () => Promise<{ ok: boolean; code?: string }>) {
    setBusy(true);
    setError(null);
    try {
      const r = await action();
      if (!r.ok) return setError(messageFor(r.code));
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }
  const open = rounds.filter((r) => r.status === 'IN_PROGRESS');
  const value = (e: FormEvent<HTMLFormElement>, name: string) => {
    e.preventDefault();
    return String(new FormData(e.currentTarget).get(name) ?? '');
  };

  return (
    <div className="stack">
      {status === 'OPEN' ? (
        <>
          <form
            className="form"
            onSubmit={(e) => {
              const partyName = value(e, 'partyName');
              void run(() => post(`cases/${caseId}/rounds`, { partyName }));
            }}
          >
            <label>
              Bên liên quan
              <input name="partyName" required maxLength={300} />
            </label>
            <button type="submit" disabled={busy}>
              Bắt đầu vòng xác minh
            </button>
          </form>
          {open.length > 0 ? (
            <>
              <form
                className="form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const file = pickedFile(form, 'file');
                  if (!file) return setError(messageFor('INVALID_DOCUMENT'));
                  const f = new FormData(form);
                  void run(() =>
                    postFile(`verification/rounds/${String(f.get('roundId'))}/source-files`, file, {
                      kind: String(f.get('kind') ?? ''),
                      confidentiality: String(f.get('confidentiality')),
                      purpose: String(f.get('purpose') ?? ''),
                    }),
                  );
                }}
              >
                <RoundSelect rounds={open} />
                <label>
                  Loại nguồn
                  <input name="kind" required maxLength={200} />
                </label>
                <label>
                  Mức bảo mật
                  <select name="confidentiality" defaultValue="CONFIDENTIAL">
                    {Object.entries(SOURCE_CONFIDENTIALITY_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Mục đích sử dụng
                  <input name="purpose" required maxLength={500} />
                </label>
                <label>
                  Tệp nguồn (PDF, JPEG, PNG; tối đa 25 MB)
                  <input
                    name="file"
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    required
                  />
                </label>
                <button type="submit" disabled={busy}>
                  Ghi nguồn kèm tệp
                </button>
              </form>
              <form
                className="form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(() =>
                    post(`rounds/${String(f.get('roundId'))}/completion`, {
                      result: String(f.get('result') ?? ''),
                    }),
                  );
                }}
              >
                <RoundSelect rounds={open} />
                <label>
                  Kết quả của vòng
                  <textarea name="result" required rows={2} maxLength={4000} />
                </label>
                <button type="submit" disabled={busy}>
                  Hoàn thành vòng
                </button>
              </form>
            </>
          ) : null}
          <form
            className="form"
            onSubmit={(e) => {
              const text = value(e, 'text');
              void run(() => post(`cases/${caseId}/conclusion-proposal`, { text }));
            }}
          >
            <label>
              Đề xuất kết luận
              <textarea name="text" required rows={2} maxLength={8000} />
            </label>
            <button type="submit" disabled={busy}>
              Gửi đề xuất kết luận
            </button>
          </form>
        </>
      ) : (
        <div>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(() => post(`cases/${caseId}/conclusion-decision`, { approve: true }))
            }
          >
            Chấp nhận kết luận
          </button>{' '}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(() => post(`cases/${caseId}/conclusion-decision`, { approve: false }))
            }
          >
            Trả về để xác minh tiếp
          </button>
        </div>
      )}
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
    </div>
  );
}

function RoundSelect({ rounds }: { readonly rounds: Props['rounds'] }) {
  return (
    <label>
      Vòng xác minh
      <select name="roundId" defaultValue={rounds[0]?.id}>
        {rounds.map((r) => (
          <option key={r.id} value={r.id}>
            {r.seq}. {r.partyName}
          </option>
        ))}
      </select>
    </label>
  );
}
