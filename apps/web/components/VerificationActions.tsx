'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { SOURCE_CONFIDENTIALITY_LABEL, messageFor } from '../lib/messages';
import { pickedFile, postFile } from '../lib/upload';
import { useDialogClose } from './StageDialog';
import { Button } from './ui/button';
import { Field, Input, Select, Textarea } from './ui/field';

export interface RoundLite {
  readonly id: string;
  readonly seq: number;
  readonly partyName: string;
  readonly status: string;
}

interface Props {
  readonly caseId: string;
  readonly status: string;
  readonly rounds: readonly {
    readonly id: string;
    readonly seq: number;
    readonly partyName: string;
    readonly status: string;
  }[];
}

async function post(path: string, body: unknown) {
  const res = await fetch(`/api/verification/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { code?: string };
  return { ok: res.ok, code: json.code };
}

type Result = { ok: boolean; code?: string };

/** Chạy một lệnh, báo lỗi bằng tiếng Việt, làm mới trang và đóng hộp thoại (nếu đang trong hộp thoại) khi thành công. */
function useRun() {
  const router = useRouter();
  const closeDialog = useDialogClose();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<Result>) {
    setBusy(true);
    setError(null);
    try {
      const r = await action();
      if (!r.ok) return setError(messageFor(r.code));
      router.refresh();
      closeDialog?.();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }
  return { run, error, busy, setError };
}

const Alert = ({ error }: { readonly error: string | null }) => (
  <p role="alert" className="error" hidden={!error}>
    {error}
  </p>
);

const value = (e: FormEvent<HTMLFormElement>, name: string) => {
  e.preventDefault();
  return String(new FormData(e.currentTarget).get(name) ?? '');
};

export function StartRoundForm({ caseId }: { readonly caseId: string }) {
  const { run, error, busy } = useRun();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        const partyName = value(e, 'partyName');
        void run(() => post(`cases/${caseId}/rounds`, { partyName }));
      }}
    >
      <p className="muted m-0">
        Mỗi bên được xác minh là một lượt riêng, có nguồn và kết quả riêng. Kết luận chỉ đề xuất
        được khi mọi lượt đã có kết quả.
      </p>
      <Field id="vx-party" label="Bên liên quan">
        <Input id="vx-party" name="partyName" required maxLength={300} />
      </Field>
      <Alert error={error} />
      <Button type="submit" loading={busy}>
        Thêm lượt xác minh
      </Button>
    </form>
  );
}

/** Ghi một nguồn kèm tệp cho lượt đang xác minh (PDF/JPEG/PNG, tối đa 25 MB). */
export function SourceFileForm({ rounds }: { readonly rounds: readonly RoundLite[] }) {
  const { run, error, busy, setError } = useRun();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const file = pickedFile(form, 'file');
        if (!file) return setError(messageFor('INVALID_DOCUMENT'));
        const f = new FormData(form);
        void run(() =>
          postFile(`verification/rounds/${String(f.get('roundId'))}/source-files`, file, {
            kind: String(f.get('kind') ?? ''),
            confidentiality: String(f.get('confidentiality')),
            purpose: String(f.get('purpose') ?? ''),
          }),
        );
      }}
    >
      <RoundSelect rounds={rounds} />
      <Field id="vx-kind" label="Loại nguồn">
        <Input id="vx-kind" name="kind" required maxLength={200} />
      </Field>
      <Field
        id="vx-conf"
        label="Mức bảo mật"
        help="Nguồn không công khai phải nêu mục đích mỗi lần mở; mọi lần mở đều được lưu nhật ký."
      >
        <Select id="vx-conf" name="confidentiality" defaultValue="CONFIDENTIAL">
          {Object.entries(SOURCE_CONFIDENTIALITY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="vx-purpose" label="Mục đích sử dụng">
        <Input id="vx-purpose" name="purpose" required maxLength={500} />
      </Field>
      <Field id="vx-file" label="Tệp nguồn (PDF, JPEG, PNG; tối đa 25 MB)">
        <Input
          id="vx-file"
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          required
        />
      </Field>
      <Alert error={error} />
      <Button type="submit" loading={busy}>
        Ghi nguồn kèm tệp
      </Button>
    </form>
  );
}

export function CompleteRoundForm({ rounds }: { readonly rounds: readonly RoundLite[] }) {
  const { run, error, busy } = useRun();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void run(() =>
          post(`rounds/${String(f.get('roundId'))}/completion`, {
            result: String(f.get('result') ?? ''),
          }),
        );
      }}
    >
      <RoundSelect rounds={rounds} />
      <Field
        id="vx-result"
        label="Kết quả của lượt"
        help="Mỗi lượt cần ít nhất một nguồn trước khi ghi kết quả."
      >
        <Textarea id="vx-result" name="result" required rows={2} maxLength={4000} />
      </Field>
      <Alert error={error} />
      <Button type="submit" loading={busy}>
        Ghi kết quả lượt
      </Button>
    </form>
  );
}

export function ConclusionProposalForm({ caseId }: { readonly caseId: string }) {
  const { run, error, busy } = useRun();
  return (
    <form
      className="form"
      onSubmit={(e) => {
        const text = value(e, 'text');
        void run(() => post(`cases/${caseId}/conclusion-proposal`, { text }));
      }}
    >
      <label>
        Đề xuất kết luận
        <textarea name="text" required rows={2} maxLength={8000} />
      </label>
      <button type="submit" disabled={busy} aria-busy={busy}>
        Gửi đề xuất kết luận
      </button>
      <Alert error={error} />
    </form>
  );
}

export function ConclusionDecision({ caseId }: { readonly caseId: string }) {
  const { run, error, busy } = useRun();
  const decide = (approve: boolean) =>
    void run(() => post(`cases/${caseId}/conclusion-decision`, { approve }));
  return (
    <div className="stack">
      <div>
        <button
          type="button"
          className="primary"
          disabled={busy}
          aria-busy={busy}
          onClick={() => decide(true)}
        >
          Chấp nhận kết luận
        </button>{' '}
        <button type="button" disabled={busy} aria-busy={busy} onClick={() => decide(false)}>
          Trả về để xác minh tiếp
        </button>
      </div>
      <Alert error={error} />
    </div>
  );
}

/**
 * Thao tác trên một hồ sơ xác minh: thêm lượt, đề xuất kết luận (THV), quyết định kết luận (Admin/Trưởng VP có quyền ký,
 * khác người đề xuất). Mỗi lượt cần ít nhất một nguồn kèm tệp (PDF/JPEG/PNG) trước khi hoàn thành.
 */
export function VerificationActions({ caseId, status, rounds }: Props) {
  if (status === 'CONCLUDED') return <span className="muted">Đã kết luận</span>;
  const open = rounds.filter((r) => r.status === 'IN_PROGRESS');
  return (
    <div className="stack">
      {status === 'OPEN' ? (
        <>
          <StartRoundForm caseId={caseId} />
          {open.length > 0 ? (
            <>
              <SourceFileForm rounds={open} />
              <CompleteRoundForm rounds={open} />
            </>
          ) : null}
          <ConclusionProposalForm caseId={caseId} />
        </>
      ) : (
        <ConclusionDecision caseId={caseId} />
      )}
    </div>
  );
}

function RoundSelect({ rounds }: { readonly rounds: readonly RoundLite[] }) {
  const only = rounds.length === 1 ? rounds[0] : undefined;
  if (only) return <input type="hidden" name="roundId" value={only.id} />;
  return (
    <Field id="vx-round" label="Lượt xác minh">
      <Select id="vx-round" name="roundId" defaultValue={rounds[0]?.id}>
        {rounds.map((r) => (
          <option key={r.id} value={r.id}>
            {r.seq}. {r.partyName}
          </option>
        ))}
      </Select>
    </Field>
  );
}
