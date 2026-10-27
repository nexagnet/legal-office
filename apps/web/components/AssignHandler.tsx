'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { messageFor } from '../lib/messages';

export interface HandlerOption {
  readonly userId: string;
  readonly label: string;
}
interface Props {
  /** Đường API (sau `/api/`) của lệnh giao việc, ví dụ `verification/cases/<id>/handler`. */
  readonly path: string;
  readonly options: readonly HandlerOption[];
  readonly currentId: string | null;
}

/** Admin giao hoặc đổi THV phụ trách một mục (văn bản tống đạt, hồ sơ xác minh, hồ sơ thi hành án). */
export function AssignHandler({ path, options, currentId }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (options.length === 0) return null;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const handlerUserId = String(new FormData(e.currentTarget).get('handler'));
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/${path}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ handlerUserId }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) {
        const message = messageFor(json.code);
        setError(message);
        toast.error(message, { duration: Infinity });
        return;
      }
      toast.success('Đã giao THV phụ trách');
      router.refresh();
    } catch {
      const message = 'Không kết nối được máy chủ. Vui lòng thử lại.';
      setError(message);
      toast.error(message, { duration: Infinity });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        {currentId ? 'Đổi THV phụ trách' : 'Giao THV phụ trách'}
        <select name="handler" defaultValue={currentId ?? options[0]?.userId}>
          {options.map((o) => (
            <option key={o.userId} value={o.userId}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={busy} aria-busy={busy}>
        Lưu
      </button>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
    </form>
  );
}
