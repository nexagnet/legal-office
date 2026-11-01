'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { formatDay } from '../../lib/deadlines';
import type { OfficeBranch, UnassignedCase } from '../../lib/dms-admin';
import { messageFor } from '../../lib/messages';
import { PERMISSION_DOMAINS } from '../../lib/permission-model';
import { postJson } from '../../lib/post-json';
import { Button } from '../ui/button';
import { Field, Select } from '../ui/field';
import { NoteBox, Pill } from './Pill';

const DOMAIN_LABEL: ReadonlyMap<string, string> = new Map(PERMISSION_DOMAINS);

/**
 * Hồ sơ cũ chưa có chi nhánh (quyết định owner 2026-11-01): chỉ Admin thấy cho tới khi được gắn chi nhánh; gắn xong thì
 * người của chi nhánh đó mới thấy. Gắn một lần, không đổi được sau đó, có nhật ký.
 */
export function UnassignedCasesSection({
  officeId,
  branches,
  cases,
  total,
}: {
  readonly officeId: string;
  readonly branches: readonly OfficeBranch[];
  readonly cases: readonly UnassignedCase[];
  readonly total: number;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (total === 0) return null;

  const allPicked = picked.size === cases.length;
  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const branchId = String(new FormData(e.currentTarget).get('branch') ?? '');
    if (picked.size === 0 || !branchId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await postJson('/dms/cases-without-branch/assign', {
        officeId,
        caseIds: [...picked],
        branchId,
      });
      if (!r.ok) return setError(messageFor(r.code));
      setNotice(`Đã gắn chi nhánh cho ${picked.size} hồ sơ.`);
      setPicked(new Set());
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 grid gap-3" aria-labelledby="unassigned-t">
      <div className="flex items-center justify-between gap-3">
        <h2 id="unassigned-t" className="font-serif text-lg">
          Hồ sơ chưa gắn chi nhánh
        </h2>
        <Pill tone="brass">{total} hồ sơ</Pill>
      </div>
      <NoteBox title="Chỉ Admin đang thấy các hồ sơ này">
        Đây là hồ sơ có từ trước khi hệ thống phân theo chi nhánh. Gắn chi nhánh xong thì người được
        cấp chi nhánh đó mới thấy. Mỗi hồ sơ chỉ gắn được một lần, không đổi lại được.
      </NoteBox>
      <form className="grid gap-3 rounded-2xl bg-surface p-4 shadow-sm" onSubmit={submit}>
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Hồ sơ chưa gắn chi nhánh</caption>
            <thead>
              <tr>
                <th scope="col">
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả hồ sơ"
                    checked={allPicked}
                    onChange={() =>
                      setPicked(allPicked ? new Set() : new Set(cases.map((c) => c.id)))
                    }
                  />
                </th>
                <th scope="col">Hồ sơ</th>
                <th scope="col">Loại</th>
                <th scope="col">Ngày tạo</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Chọn ${c.title}`}
                      checked={picked.has(c.id)}
                      onChange={() => toggle(c.id)}
                    />
                  </td>
                  <th scope="row">{c.title}</th>
                  <td>{DOMAIN_LABEL.get(c.domain) ?? c.domain}</td>
                  <td>{formatDay(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {total > cases.length ? (
          <p className="muted">
            Đang hiển thị {cases.length} hồ sơ đầu tiên trong {total}. Gắn xong sẽ hiện tiếp.
          </p>
        ) : null}
        <div className="flex flex-wrap items-end gap-3">
          <Field id="unassigned-branch" label="Gắn vào chi nhánh">
            <Select id="unassigned-branch" name="branch" required defaultValue="">
              <option value="" disabled>
                Chọn chi nhánh
              </option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" disabled={busy || picked.size === 0} aria-busy={busy}>
            {busy ? 'Đang gắn…' : `Gắn chi nhánh (${picked.size})`}
          </Button>
        </div>
        {error ? <p role="alert">{error}</p> : null}
        {notice ? <p role="status">{notice}</p> : null}
      </form>
    </section>
  );
}
