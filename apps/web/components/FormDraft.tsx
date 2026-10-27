'use client';

import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';
import { CheckPanel } from './CheckPanel';

export interface DraftField {
  /** Đường dẫn trường trong đầu vào biểu mẫu, ví dụ `requester.organization.name`. */
  readonly path: string;
  readonly label: string;
  readonly type?: 'text' | 'date' | 'textarea';
  readonly placeholder?: string;
}

interface Props {
  readonly officeId: string;
  readonly code: string;
  readonly title: string;
  readonly fields: readonly DraftField[];
  readonly checks: readonly string[];
  readonly checkTitle: string;
  readonly action: string;
}

/** Dựng object lồng nhau từ các đường dẫn `a.b.c`; bỏ qua trường để trống để mẫu giữ chỗ chấm gốc. */
export function buildInput(form: FormData, fields: readonly DraftField[]): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const f of fields) {
    const value = String(form.get(f.path) ?? '').trim();
    if (!value) continue;
    const keys = f.path.split('.');
    let node = root;
    for (const k of keys.slice(0, -1)) {
      node = (node[k] ??= {}) as Record<string, unknown>;
    }
    node[keys[keys.length - 1]!] = value;
  }
  return root;
}

/** Soạn bản NHÁP DOCX của biểu mẫu N-xx (Figma 16:126, 16:188). Không lưu tệp, không ký, không phát hành. */
export function FormDraft({ officeId, code, title, fields, checks, checkTitle, action }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = buildInput(new FormData(e.currentTarget), fields);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/office/forms/${encodeURIComponent(code)}/draft`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ officeId, input }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { code?: string; label?: string };
        return setError(json.label ?? messageFor(json.code));
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `ban-nhap-${code.toLowerCase()}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panels assign-grid" onSubmit={submit}>
      <section className="panel form">
        <h2>{title}</h2>
        {fields.map((f) => (
          <label key={f.path}>
            {f.label}
            {f.type === 'textarea' ? (
              <textarea name={f.path} rows={3} placeholder={f.placeholder} maxLength={4000} />
            ) : (
              <input
                name={f.path}
                type={f.type === 'date' ? 'date' : 'text'}
                placeholder={f.placeholder}
                maxLength={500}
              />
            )}
          </label>
        ))}
      </section>
      <CheckPanel title={checkTitle} checks={checks}>
        <p role="alert" className="error" hidden={!error}>
          {error}
        </p>
        <button type="submit" className="primary wide" disabled={busy} aria-busy={busy}>
          {action}
        </button>
      </CheckPanel>
    </form>
  );
}
