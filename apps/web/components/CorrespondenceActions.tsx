'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';
import { pickedFile, postFile } from '../lib/upload';

interface Props {
  readonly id: string;
  readonly direction: string;
  readonly status: string;
}

async function post(path: string, body?: unknown) {
  const res = await fetch(`/api/office/correspondence/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { code?: string };
  return { ok: res.ok, code: json.code };
}

/**
 * Bước tiếp theo của một công văn: đến → ghi kết quả xử lý; đi → đính kèm bản cuối, trình duyệt, duyệt, ban hành kèm
 * chứng từ gửi. Chỉ hiện bước hợp với trạng thái; quyền (Admin/Trưởng VP duyệt và ban hành, quyền ký) do DB quyết định.
 */
export function CorrespondenceActions({ id, direction, status }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
  const form = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    return e.currentTarget;
  };

  let step: React.ReactNode = <span className="muted">Đã kết thúc</span>;
  if (direction === 'INBOUND' && status === 'RECEIVED') {
    step = (
      <form
        className="form"
        onSubmit={(e) => {
          const f = new FormData(form(e));
          const archiveRef = String(f.get('archiveRef') ?? '').trim();
          void run(() =>
            post(`${id}/result`, {
              result: String(f.get('result') ?? ''),
              ...(archiveRef ? { archiveRef } : {}),
            }),
          );
        }}
      >
        <label>
          Kết quả xử lý
          <textarea name="result" required rows={2} maxLength={4000} />
        </label>
        <label>
          Nơi lưu hồ sơ
          <input name="archiveRef" maxLength={500} />
        </label>
        <button type="submit" disabled={busy} aria-busy={busy}>
          Ghi kết quả xử lý
        </button>
      </form>
    );
  } else if (direction === 'OUTBOUND' && status === 'DRAFT') {
    step = (
      <div className="stack">
        <form
          className="form"
          onSubmit={(e) => {
            const f = form(e);
            const file = pickedFile(f, 'file');
            if (!file) return setError(messageFor('INVALID_DOCUMENT'));
            void run(() =>
              postFile(`office/correspondence/${id}/attachment-files`, file, {
                role: 'FINAL_DOCUMENT',
              }),
            );
          }}
        >
          <label>
            Bản cuối của công văn (PDF, JPEG, PNG; tối đa 25 MB)
            <input name="file" type="file" accept="application/pdf,image/jpeg,image/png" required />
          </label>
          <button type="submit" disabled={busy} aria-busy={busy}>
            Đính kèm bản cuối
          </button>
        </form>
        <button
          type="button"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void run(() => post(`${id}/submission`))}
        >
          Trình duyệt
        </button>
      </div>
    );
  } else if (direction === 'OUTBOUND' && status === 'SUBMITTED') {
    step = (
      <button
        type="button"
        className="primary"
        disabled={busy}
        aria-busy={busy}
        onClick={() => void run(() => post(`${id}/approval`))}
      >
        Duyệt
      </button>
    );
  } else if (direction === 'OUTBOUND' && status === 'APPROVED') {
    step = (
      <form
        className="form"
        onSubmit={(e) => {
          const f = form(e);
          const file = pickedFile(f, 'proof');
          if (!file) return setError(messageFor('SEND_PROOF_REQUIRED'));
          const data = new FormData(f);
          void run(() =>
            postFile(`office/correspondence/${id}/issuance-file`, file, {
              refNo: String(data.get('refNo') ?? ''),
              issuedOn: String(data.get('issuedOn') ?? ''),
              sendMethod: String(data.get('sendMethod') ?? ''),
            }),
          );
        }}
      >
        <label>
          Số, ký hiệu
          <input name="refNo" required maxLength={200} />
        </label>
        <label>
          Ngày ban hành
          <input name="issuedOn" type="date" required />
        </label>
        <label>
          Hình thức gửi
          <input name="sendMethod" required maxLength={200} />
        </label>
        <label>
          Chứng từ gửi đi (PDF, JPEG, PNG; tối đa 25 MB)
          <input name="proof" type="file" accept="application/pdf,image/jpeg,image/png" required />
        </label>
        <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
          Ban hành
        </button>
      </form>
    );
  }

  return (
    <div className="stack">
      {step}
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
    </div>
  );
}
