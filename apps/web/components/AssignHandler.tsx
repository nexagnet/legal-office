'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { messageFor } from '../lib/messages';
import { useDialogClose } from './StageDialog';
import { PersonRadioList } from './PersonRadioList';

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
      <PersonRadioList
        legend={currentId ? 'Đổi THV phụ trách' : 'Giao THV phụ trách'}
        name="handler"
        options={options}
        defaultId={currentId}
      />
      <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
        Lưu
      </button>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
    </form>
  );
}
