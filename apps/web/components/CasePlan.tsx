'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';
import { Button } from './ui/button';
import { Field, Input, Select, Textarea } from './ui/field';
import { Notice, Sheet, SheetBody, SheetFooter } from './ui/sheet';

export const PARTY_ROLE_LABEL: Record<string, string> = {
  SELLER: 'Bên bán',
  BUYER: 'Bên mua',
  WITNESS: 'Người làm chứng',
  OTHER: 'Khác',
};

export interface PlanParty {
  readonly name: string;
  readonly role: string;
}
export interface Plan {
  readonly scheduledAt: string | null;
  readonly internalNote: string | null;
  readonly parties: readonly PlanParty[];
}

const dateFmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

/** Giá trị cho ô `datetime-local` theo giờ Việt Nam từ một thời điểm ISO. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 7 * 3600_000);
  return d.toISOString().slice(0, 16);
}

/** Kế hoạch lập Vi bằng (Figma V1): thời gian dự kiến, người tham gia, ghi chú nội bộ. */
export function CasePlanView({ plan }: { readonly plan: Plan }) {
  return (
    <div className="grid gap-2">
      <p className="m-0 text-[13px] text-muted">
        Thời gian dự kiến:{' '}
        <strong className="text-ink">
          {plan.scheduledAt ? dateFmt.format(new Date(plan.scheduledAt)) : 'Chưa ghi nhận'}
        </strong>
      </p>
      {plan.parties.length === 0 ? (
        <p className="muted m-0">Chưa ghi người tham gia.</p>
      ) : (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {plan.parties.map((p, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2"
            >
              <strong>{p.name}</strong>
              <span className="text-[13px] text-muted">{PARTY_ROLE_LABEL[p.role] ?? p.role}</span>
            </li>
          ))}
        </ul>
      )}
      {plan.internalNote ? (
        <p className="m-0 text-[13px]">Ghi chú nội bộ: {plan.internalNote}</p>
      ) : null}
    </div>
  );
}

export function EditPlanSheet({ caseId, plan }: { readonly caseId: string; readonly plan: Plan }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [parties, setParties] = useState<PlanParty[]>([...plan.parties]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const when = String(f.get('scheduledAt') ?? '').trim();
    const kept = parties.filter((p) => p.name.trim());
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/vibang/cases/${caseId}/plan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scheduledAt: when ? new Date(`${when}:00+07:00`).toISOString() : null,
          internalNote: String(f.get('internalNote') ?? '').trim() || null,
          parties: kept.map((p) => ({ name: p.name.trim(), role: p.role })),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setError(messageFor(json.code));
      setOpen(false);
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Cập nhật kế hoạch
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Kế hoạch lập Vi bằng"
        description="Thời gian dự kiến, người tham gia và ghi chú nội bộ. Không bắt buộc đủ ngay."
      >
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <SheetBody>
            <Field id="plan-when" label="Thời gian dự kiến (giờ Việt Nam)">
              <Input
                id="plan-when"
                name="scheduledAt"
                type="datetime-local"
                defaultValue={toLocalInput(plan.scheduledAt)}
              />
            </Field>
            <div className="grid gap-2">
              <span className="text-[13px] font-semibold text-ink">Người tham gia</span>
              {parties.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                  <Input
                    aria-label={`Tên người tham gia ${i + 1}`}
                    value={p.name}
                    maxLength={300}
                    onChange={(e) =>
                      setParties((all) =>
                        all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                      )
                    }
                  />
                  <Select
                    aria-label={`Vai trò người tham gia ${i + 1}`}
                    value={p.role}
                    onChange={(e) =>
                      setParties((all) =>
                        all.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)),
                      )
                    }
                  >
                    {Object.entries(PARTY_ROLE_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                  <Button
                    variant="ghost"
                    onClick={() => setParties((all) => all.filter((_, j) => j !== i))}
                  >
                    Bỏ
                  </Button>
                </div>
              ))}
              {parties.length < 20 ? (
                <div>
                  <Button
                    variant="ghost"
                    onClick={() => setParties((all) => [...all, { name: '', role: 'SELLER' }])}
                  >
                    + Thêm người tham gia
                  </Button>
                </div>
              ) : null}
            </div>
            <Field id="plan-note" label="Ghi chú nội bộ">
              <Textarea
                id="plan-note"
                name="internalNote"
                maxLength={2000}
                defaultValue={plan.internalNote ?? ''}
              />
            </Field>
            {error ? (
              <Notice tone="danger" title="Chưa lưu được">
                {error}
              </Notice>
            ) : null}
          </SheetBody>
          <SheetFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button type="submit" loading={busy}>
              Lưu kế hoạch
            </Button>
          </SheetFooter>
        </form>
      </Sheet>
    </>
  );
}
