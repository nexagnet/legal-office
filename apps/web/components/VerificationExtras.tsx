'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  DELEGATION_STATUS_LABEL,
  DELEGATION_STEP_LABEL,
  SOURCE_CONFIDENTIALITY_LABEL,
  messageFor,
} from '../lib/messages';
import { pickedFile, postFile } from '../lib/upload';
import { FormSheet, text } from './EnforcementAssets';
import { Button } from './ui/button';
import { Field, Input, Select } from './ui/field';

export interface SourceAccess {
  readonly actorUserId: string;
  readonly purpose: string | null;
  readonly at: string;
}
export interface Source {
  readonly id: string;
  readonly roundSeq: number;
  readonly kind: string;
  readonly confidentiality: string;
  readonly purpose: string;
  readonly at: string;
  readonly accesses: readonly SourceAccess[];
}
export interface Delegation {
  readonly id: string;
  readonly delegateUserId: string;
  readonly status: string;
  readonly createdAt: string;
  readonly steps: readonly { readonly step: string; readonly at: string }[];
}
export interface Decision {
  readonly decisionNo: string;
  readonly signedOn: string;
  readonly recordedAt: string;
}

const STEP_ORDER = ['CONSENT', 'APP_APPROVAL', 'LEGAL_SIGNATURE', 'HANDOVER'] as const;

const dateFmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

async function postJson(path: string, body?: unknown) {
  const res = await fetch(`/api/verification/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { code?: string };
  return { ok: res.ok, code: json.code };
}

/** Ghi nhận một lần mở nguồn: bắt buộc nêu mục đích với nguồn không công khai; mọi lần mở đều được lưu nhật ký. */
function OpenSourceForm({ sourceId, pub }: { readonly sourceId: string; readonly pub: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const purpose = text(e.currentTarget, 'purpose');
    if (!pub && !purpose) return setError(messageFor('PURPOSE_REQUIRED'));
    setBusy(true);
    setError(null);
    try {
      const r = await postJson(`sources/${sourceId}/access`, purpose ? { purpose } : {});
      if (!r.ok) return setError(messageFor(r.code));
      setDone(true);
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <Input
        name="purpose"
        aria-label="Mục đích mở nguồn"
        placeholder={pub ? 'Mục đích (không bắt buộc)' : 'Mục đích mở nguồn'}
        maxLength={500}
      />
      <Button type="submit" variant="secondary" loading={busy}>
        Ghi nhận mở nguồn
      </Button>
      {done ? <span className="text-[13px] text-muted">Đã ghi nhật ký.</span> : null}
      {error ? (
        <span role="alert" className="text-[13px] text-danger">
          {error}
        </span>
      ) : null}
    </form>
  );
}

export function SourceList({
  sources,
  names,
  canOpen,
}: {
  readonly sources: readonly Source[];
  readonly names: Readonly<Record<string, string>>;
  readonly canOpen: boolean;
}) {
  if (sources.length === 0) return <p className="muted">Chưa có nguồn nào.</p>;
  return (
    <ul className="m-0 grid list-none gap-4 p-0">
      {sources.map((s) => (
        <li key={s.id} className="grid gap-1 border-b border-line pb-4 last:border-0 last:pb-0">
          <span className="font-semibold">
            Lượt {s.roundSeq} · {s.kind}
          </span>
          <span className="text-[13px] text-muted">
            {SOURCE_CONFIDENTIALITY_LABEL[s.confidentiality] ?? s.confidentiality} · Mục đích:{' '}
            {s.purpose} · ghi {dateFmt.format(new Date(s.at))}
          </span>
          {s.accesses.length > 0 ? (
            <ul className="m-0 grid list-none gap-0.5 p-0 text-[13px]">
              {s.accesses.map((a, i) => (
                <li key={i}>
                  Đã mở {dateFmt.format(new Date(a.at))} · {names[a.actorUserId] ?? 'Người dùng'}
                  {a.purpose ? ` · ${a.purpose}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-[13px] text-muted">Chưa ai mở nguồn này.</span>
          )}
          {canOpen ? <OpenSourceForm sourceId={s.id} pub={s.confidentiality === 'PUBLIC'} /> : null}
        </li>
      ))}
    </ul>
  );
}

/** Tạo yêu cầu ủy quyền cho một THV khác cùng văn phòng. */
export function RequestDelegationSheet({
  caseId,
  options,
}: {
  readonly caseId: string;
  readonly options: readonly { readonly userId: string; readonly label: string }[];
}) {
  return (
    <FormSheet
      trigger="Tạo ủy quyền"
      title="Tạo ủy quyền thực hiện"
      description="Cần đủ bốn bước: đồng ý bằng văn bản của người yêu cầu, duyệt trong ứng dụng, chữ ký pháp lý và biên bản bàn giao. Đủ bốn bước mới kích hoạt."
      submitLabel="Tạo ủy quyền"
      variant="primary"
      onSubmit={(form) => {
        const delegateUserId = text(form, 'delegate');
        if (!delegateUserId) return Promise.resolve('Hãy chọn THV được ủy quyền.');
        return postJson(`cases/${caseId}/delegations`, { delegateUserId });
      }}
    >
      <Field id="dg-to" label="THV được ủy quyền">
        <Select id="dg-to" name="delegate" defaultValue="">
          <option value="" disabled>
            Chọn THV
          </option>
          {options.map((o) => (
            <option key={o.userId} value={o.userId}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
    </FormSheet>
  );
}

function DelegationStepSheet({
  delegationId,
  step,
}: {
  readonly delegationId: string;
  readonly step: string;
}) {
  return (
    <FormSheet
      trigger={`Ghi bước: ${DELEGATION_STEP_LABEL[step] ?? step}`}
      title={DELEGATION_STEP_LABEL[step] ?? step}
      description="Tải tệp bằng chứng của bước này (PDF, JPEG, PNG). Quyền ghi từng bước do máy chủ kiểm."
      submitLabel="Ghi bước"
      onSubmit={(form) => {
        const file = pickedFile(form, 'file');
        if (!file) return Promise.resolve('Hãy chọn tệp bằng chứng.');
        return postFile(`verification/delegations/${delegationId}/step-files`, file, { step });
      }}
    >
      <Field id={`ds-${delegationId}-${step}`} label="Tệp bằng chứng">
        <Input
          id={`ds-${delegationId}-${step}`}
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
        />
      </Field>
    </FormSheet>
  );
}

function ActivateButton({ delegationId }: { readonly delegationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function activate() {
    setBusy(true);
    setError(null);
    try {
      const r = await postJson(`delegations/${delegationId}/activation`);
      if (!r.ok) return setError(messageFor(r.code));
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button onClick={activate} loading={busy}>
        Kích hoạt ủy quyền
      </Button>
      {error ? (
        <span role="alert" className="text-[13px] text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}

export function DelegationList({
  delegations,
  names,
  canWrite,
  canActivate,
}: {
  readonly delegations: readonly Delegation[];
  readonly names: Readonly<Record<string, string>>;
  readonly canWrite: boolean;
  readonly canActivate: boolean;
}) {
  if (delegations.length === 0) return <p className="muted">Chưa có ủy quyền nào.</p>;
  return (
    <ul className="m-0 grid list-none gap-4 p-0">
      {delegations.map((d) => {
        const done = new Set(d.steps.map((s) => s.step));
        const pending = d.status === 'PENDING';
        return (
          <li key={d.id} className="grid gap-2 border-b border-line pb-4 last:border-0 last:pb-0">
            <span className="font-semibold">
              Ủy quyền cho {names[d.delegateUserId] ?? 'THV được chọn'} ·{' '}
              {DELEGATION_STATUS_LABEL[d.status] ?? d.status}
            </span>
            <ol className="m-0 grid list-none gap-1 p-0 text-[13px]">
              {STEP_ORDER.map((s) => {
                const rec = d.steps.find((x) => x.step === s);
                return (
                  <li key={s}>
                    {rec ? '✓' : '○'} {DELEGATION_STEP_LABEL[s]}
                    {rec ? ` · ${dateFmt.format(new Date(rec.at))}` : ''}
                  </li>
                );
              })}
            </ol>
            {pending && canWrite ? (
              <div className="flex flex-wrap gap-2">
                {STEP_ORDER.filter((s) => !done.has(s)).map((s) => (
                  <DelegationStepSheet key={s} delegationId={d.id} step={s} />
                ))}
                {canActivate && done.size === STEP_ORDER.length ? (
                  <ActivateButton delegationId={d.id} />
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Ghi quyết định N-06 (số, ngày ký, tệp đã ký). Chỉ Trưởng VP hoặc Admin có quyền ký pháp lý. */
export function RecordDecisionSheet({ caseId }: { readonly caseId: string }) {
  return (
    <FormSheet
      trigger="Ghi quyết định N-06"
      title="Ghi quyết định xác minh (N-06)"
      description="Trưởng VP ra quyết định trong 3 ngày làm việc kể từ ngày ký hợp đồng. Ghi xong thì đóng hạn tương ứng."
      submitLabel="Ghi quyết định"
      variant="primary"
      onSubmit={(form) => {
        const decisionNo = text(form, 'no');
        const signedOn = text(form, 'date');
        const file = pickedFile(form, 'file');
        if (!decisionNo || !signedOn) return Promise.resolve('Hãy nhập số và ngày ký quyết định.');
        if (!file) return Promise.resolve('Hãy chọn tệp quyết định đã ký.');
        return postFile(`verification/cases/${caseId}/decision-file`, file, {
          decisionNo,
          signedOn,
        });
      }}
    >
      <Field id="n06-no" label="Số quyết định">
        <Input id="n06-no" name="no" maxLength={200} />
      </Field>
      <Field id="n06-date" label="Ngày ký">
        <Input id="n06-date" name="date" type="date" />
      </Field>
      <Field id="n06-file" label="Tệp quyết định đã ký">
        <Input
          id="n06-file"
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
        />
      </Field>
    </FormSheet>
  );
}
