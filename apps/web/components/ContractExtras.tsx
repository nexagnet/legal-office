'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Customer } from '../lib/customers';
import { messageFor } from '../lib/messages';
import { postFile } from '../lib/upload';
import { ContractAddenda } from './ContractAddenda';

interface Attachment {
  readonly id: number;
  readonly name: string;
}
interface Party {
  readonly customerId: string;
  readonly role: string;
  readonly displayName: string | null;
  readonly externalRef: string;
}

export const PARTY_ROLE_LABEL: Readonly<Record<string, string>> = {
  REPRESENTATIVE: 'Người đại diện',
  BENEFICIARY: 'Người thụ hưởng',
  WITNESS: 'Người làm chứng',
  OTHER: 'Khác',
};

/** Tệp đính kèm (bản scan) và người tham gia của một hợp đồng. */
export function ContractExtras({
  contractId,
  customers,
}: {
  readonly contractId: string;
  readonly customers: readonly Customer[];
}) {
  const base = `/api/vibang/contracts/${contractId}`;
  const [files, setFiles] = useState<readonly Attachment[]>([]);
  const [parties, setParties] = useState<readonly Party[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, p] = await Promise.all([
        fetch(`${base}/attachments`).then((r) => (r.ok ? r.json() : [])),
        fetch(`${base}/parties`).then((r) => (r.ok ? r.json() : [])),
      ]);
      setFiles(Array.isArray(a) ? (a as Attachment[]) : []);
      setParties(Array.isArray(p) ? (p as Party[]) : []);
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    }
  }, [base]);

  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (opened) void load();
  }, [opened, load]);

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const file = f.get('file');
    if (!(file instanceof File) || file.size === 0) return setError('Chọn một tệp PDF/JPEG/PNG.');
    setError(null);
    const r = await postFile(`vibang/contracts/${contractId}/attachment-files`, file, {
      name: String(f.get('name') ?? '') || file.name,
    });
    if (!r.ok) return setError(messageFor(r.code));
    e.currentTarget.reset();
    await load();
  }

  async function addParty(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const res = await fetch(`${base}/parties/${String(f.get('customerId'))}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: String(f.get('role')) }),
    });
    const json = (await res.json().catch(() => ({}))) as { code?: string };
    if (!res.ok) return setError(messageFor(json.code));
    setError(null);
    await load();
  }

  async function removeParty(customerId: string) {
    const res = await fetch(`${base}/parties/${customerId}/remove`, { method: 'POST' });
    if (res.ok) await load();
  }

  return (
    <details
      className="contract-extras"
      onToggle={(e) => setOpened((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>Tệp hợp đồng và người tham gia</summary>
      <h3>Tệp hợp đồng</h3>
      {files.length === 0 ? (
        <p>Chưa có tệp.</p>
      ) : (
        <ul>
          {files.map((a) => (
            <li key={a.id}>
              <a href={`${base}/attachments/${a.id}`}>{a.name}</a>
            </li>
          ))}
        </ul>
      )}
      <form className="form" onSubmit={upload}>
        <label>
          Tên tệp
          <input name="name" maxLength={200} />
        </label>
        <input name="file" type="file" accept="application/pdf,image/jpeg,image/png" />
        <button type="submit">Tải lên</button>
      </form>
      <h3>Người tham gia</h3>
      {parties.length === 0 ? (
        <p>Chưa liên kết người tham gia.</p>
      ) : (
        <ul>
          {parties.map((p) => (
            <li key={p.customerId}>
              {p.displayName ?? p.externalRef} · {PARTY_ROLE_LABEL[p.role] ?? p.role}{' '}
              <button type="button" onClick={() => void removeParty(p.customerId)}>
                Gỡ
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="form" onSubmit={addParty}>
        <label>
          Khách
          <select name="customerId" required>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName ?? c.externalRef}
              </option>
            ))}
          </select>
        </label>
        <label>
          Vai trò
          <select name="role" defaultValue="REPRESENTATIVE">
            {Object.entries(PARTY_ROLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Liên kết</button>
      </form>
      <ContractAddenda contractId={contractId} active={opened} />
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
    </details>
  );
}
