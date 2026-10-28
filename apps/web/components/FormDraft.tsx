'use client';

import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';
import { Button } from './ui/button';
import { ConditionList } from './ui/condition-list';
import { Field, Input, Textarea } from './ui/field';

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
    <form
      className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
      onSubmit={submit}
    >
      <section className="panel grid gap-4">
        <h2 className="!m-0">{title}</h2>
        {fields.map((f) => {
          const id = `draft-${f.path}`;
          return (
            <Field key={f.path} id={id} label={f.label}>
              {f.type === 'textarea' ? (
                <Textarea
                  id={id}
                  name={f.path}
                  rows={3}
                  placeholder={f.placeholder}
                  maxLength={4000}
                />
              ) : (
                <Input
                  id={id}
                  name={f.path}
                  type={f.type === 'date' ? 'date' : 'text'}
                  placeholder={f.placeholder}
                  maxLength={500}
                />
              )}
            </Field>
          );
        })}
      </section>
      <aside className="panel grid gap-4" aria-labelledby="draft-rules">
        <h2 id="draft-rules" className="!m-0">
          {checkTitle}
        </h2>
        <ConditionList
          label={checkTitle}
          conditions={checks.map((c) => ({ key: c, title: c, met: true }))}
        />
        <p className="m-0 rounded-xl bg-accent-soft px-4 py-3 text-[13px] text-accent">
          Chỉ soạn bản nháp Word từ mẫu. Không lưu tệp, không ký, không phát hành; ô để trống giữ
          chỗ chấm trong mẫu gốc.
        </p>
        {error ? (
          <p role="alert" className="m-0 text-[13px] font-semibold text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" loading={busy}>
          {action}
        </Button>
      </aside>
    </form>
  );
}
