'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';

/** Gọi các hành động của một hồ sơ Vi bằng; lỗi hiển thị bằng lý do tiếng Việt, quyền thật do máy chủ quyết định. */
export function useCaseApi(caseId: string) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function send(path: string, init: RequestInit) {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const res = await fetch(`/api/vibang/cases/${caseId}/${path}`, init);
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setError(messageFor(json.code));
      setDone(true);
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  const call = (method: string, path: string, body?: unknown) =>
    send(path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  function recordMisa(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const reference = String(new FormData(e.currentTarget).get('reference') ?? '').trim();
    void call('PUT', 'misa', { status: 'CONFIRMED_FULL', reference });
  }

  async function uploadScan(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem('scan') as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file || file.size === 0) return setError(messageFor('INVALID_DOCUMENT'));
    await send('final-scan', {
      method: 'POST',
      headers: { 'content-type': 'application/pdf' },
      body: file,
    });
  }

  return { busy, done, error, call, recordMisa, uploadScan };
}
