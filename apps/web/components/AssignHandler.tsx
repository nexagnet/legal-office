'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { messageFor } from '../lib/messages';
import { personName } from '../lib/avatar';
import { useDialogClose } from './StageDialog';
import { Avatar } from './ui/avatar';

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
  const closeDialog = useDialogClose();
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
      closeDialog?.();
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
      <fieldset className="grid gap-2 border-0 p-0">
        <legend className="mb-1 text-[13px] font-semibold">
          {currentId ? 'Đổi THV phụ trách' : 'Giao THV phụ trách'}
        </legend>
        {options.map((o) => (
          <label
            key={o.userId}
            className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-3 text-sm has-[:checked]:border-2 has-[:checked]:border-accent has-[:checked]:bg-accent-soft/40"
          >
            <input
              type="radio"
              name="handler"
              value={o.userId}
              defaultChecked={o.userId === (currentId ?? options[0]?.userId)}
              className="size-4 accent-[var(--accent)]"
            />
            <Avatar name={personName(o.label)} id={o.userId} />
            <span className="font-semibold">{personName(o.label)}</span>
            {o.label !== personName(o.label) ? (
              <span className="text-xs text-muted">
                {o.label.slice(personName(o.label).length).trim()}
              </span>
            ) : null}
          </label>
        ))}
      </fieldset>
      <button type="submit" disabled={busy} aria-busy={busy}>
        Lưu
      </button>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
    </form>
  );
}
