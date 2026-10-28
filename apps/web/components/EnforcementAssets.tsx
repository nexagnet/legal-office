'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import {
  ASSET_EVENT_KIND_LABEL,
  ASSET_SENSITIVITY_LABEL,
  MEASURE_STATUS_LABEL,
  messageFor,
} from '../lib/messages';
import { pickedFile, postFile } from '../lib/upload';
import { Button } from './ui/button';
import { Field, Input, Select, Textarea } from './ui/field';
import { Notice, Sheet, SheetBody, SheetFooter } from './ui/sheet';

export interface AssetEvent {
  readonly kind: string;
  readonly note: string;
  readonly at: string;
}
export interface AssetProposal {
  readonly id: string;
  readonly measure: string;
  readonly rationale: string;
  readonly status: string;
  readonly agencyName: string | null;
  readonly orderRef: string | null;
}
export interface Asset {
  readonly id: string;
  readonly category: string;
  readonly label: string | null;
  readonly sensitivity: string;
  readonly events: readonly AssetEvent[];
  readonly proposals: readonly AssetProposal[];
}

type Result = { readonly ok: boolean; readonly code?: string; readonly label?: string | null };

async function postJson(path: string, body: unknown): Promise<Result> {
  const res = await fetch(`/api/enforcement/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { code?: string; label?: string | null };
  return { ok: res.ok, code: json.code, label: json.label };
}

const atFmt = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeZone: 'Asia/Ho_Chi_Minh',
});

/** Ngăn kéo có một biểu mẫu: khoá nút khi đang gửi, hiện lỗi tiếng Việt, làm mới trang khi xong. */
function FormSheet({
  trigger,
  title,
  description,
  submitLabel,
  variant = 'secondary',
  onSubmit,
  children,
}: {
  readonly trigger: string;
  readonly title: string;
  readonly description: string;
  readonly submitLabel: string;
  readonly variant?: 'primary' | 'secondary' | 'ghost';
  readonly onSubmit: (form: HTMLFormElement) => Promise<Result | string>;
  readonly children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    try {
      const r = await onSubmit(form);
      if (typeof r === 'string') return setError(r);
      if (!r.ok) return setError(messageFor(r.code));
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
      <Button variant={variant} onClick={() => setOpen(true)}>
        {trigger}
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title={title} description={description}>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <SheetBody>
            {children}
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
              {submitLabel}
            </Button>
          </SheetFooter>
        </form>
      </Sheet>
    </>
  );
}

const text = (form: HTMLFormElement, name: string) =>
  String(new FormData(form).get(name) ?? '').trim();

/** Thêm một tài sản vào hồ sơ. Nhãn tài sản nhạy cảm sẽ bị ẩn ở danh sách. */
export function AddAssetSheet({ caseId }: { readonly caseId: string }) {
  return (
    <FormSheet
      trigger="Thêm tài sản"
      title="Thêm tài sản"
      description="Ghi nhận tài sản có thể dùng để thi hành. Tài sản nhạy cảm được ẩn nhãn, xem lại phải nêu mục đích."
      submitLabel="Lưu tài sản"
      variant="primary"
      onSubmit={(form) => {
        const category = text(form, 'category');
        const label = text(form, 'label');
        if (!category || !label) return Promise.resolve('Hãy nhập loại và mô tả tài sản.');
        return postJson(`cases/${caseId}/assets`, {
          category,
          label,
          sensitivity: text(form, 'sensitivity'),
        });
      }}
    >
      <Field id="as-cat" label="Loại tài sản" help="Ví dụ: bất động sản, phương tiện, tài khoản">
        <Input id="as-cat" name="category" maxLength={200} />
      </Field>
      <Field id="as-label" label="Mô tả / nhãn">
        <Input id="as-label" name="label" maxLength={500} />
      </Field>
      <Field id="as-sens" label="Mức nhạy cảm">
        <Select id="as-sens" name="sensitivity" defaultValue="NORMAL">
          {Object.entries(ASSET_SENSITIVITY_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
    </FormSheet>
  );
}

/** Ghi một sự kiện của tài sản, bắt buộc kèm tệp chứng cứ. */
export function AssetEventSheet({ assetId }: { readonly assetId: string }) {
  return (
    <FormSheet
      trigger="Ghi sự kiện"
      title="Ghi sự kiện của tài sản"
      description="Phát hiện, xác minh, tranh chấp hoặc bàn giao. Mỗi sự kiện phải có tệp chứng cứ (PDF, JPEG, PNG)."
      submitLabel="Lưu sự kiện"
      onSubmit={(form) => {
        const note = text(form, 'note');
        const file = pickedFile(form, 'file');
        if (!note) return Promise.resolve('Hãy ghi nội dung sự kiện.');
        if (!file) return Promise.resolve('Hãy chọn tệp chứng cứ.');
        return postFile(`enforcement/assets/${assetId}/event-files`, file, {
          kind: text(form, 'kind'),
          note,
          idempotencyKey: crypto.randomUUID(),
        });
      }}
    >
      <Field id={`ev-kind-${assetId}`} label="Loại sự kiện">
        <Select id={`ev-kind-${assetId}`} name="kind" defaultValue="DISCOVERY">
          {Object.entries(ASSET_EVENT_KIND_LABEL)
            .filter(([k]) => k !== 'ORDER_RECORDED')
            .map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
        </Select>
      </Field>
      <Field id={`ev-note-${assetId}`} label="Nội dung">
        <Textarea id={`ev-note-${assetId}`} name="note" maxLength={4000} />
      </Field>
      <Field id={`ev-file-${assetId}`} label="Tệp chứng cứ">
        <Input
          id={`ev-file-${assetId}`}
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
        />
      </Field>
    </FormSheet>
  );
}

/** Đề xuất biện pháp bảo đảm cho tài sản. Đây mới là đề xuất, chưa phải biện pháp đã áp dụng. */
export function ProposeMeasureSheet({ assetId }: { readonly assetId: string }) {
  return (
    <FormSheet
      trigger="Đề xuất biện pháp"
      title="Đề xuất biện pháp"
      description="Chỉ là đề xuất. Biện pháp chỉ được tính là đã áp dụng khi có lệnh có chữ ký của cơ quan có thẩm quyền."
      submitLabel="Gửi đề xuất"
      onSubmit={(form) => {
        const measure = text(form, 'measure');
        const rationale = text(form, 'rationale');
        if (!measure || !rationale) return Promise.resolve('Hãy nhập biện pháp và lý do đề xuất.');
        return postJson(`assets/${assetId}/measure-proposals`, { measure, rationale });
      }}
    >
      <Field id={`ms-${assetId}`} label="Biện pháp đề xuất">
        <Input id={`ms-${assetId}`} name="measure" maxLength={500} />
      </Field>
      <Field id={`ms-why-${assetId}`} label="Lý do">
        <Textarea id={`ms-why-${assetId}`} name="rationale" maxLength={4000} />
      </Field>
    </FormSheet>
  );
}

/** Ghi nhận lệnh có chữ ký của cơ quan có thẩm quyền cho một đề xuất (Admin hoặc Trưởng VP). */
export function RecordOrderSheet({ proposalId }: { readonly proposalId: string }) {
  return (
    <FormSheet
      trigger="Ghi lệnh cơ quan"
      title="Ghi nhận lệnh của cơ quan có thẩm quyền"
      description="Hệ thống chỉ ghi nhận lệnh đã có chữ ký, không tự đóng băng hay kê biên."
      submitLabel="Ghi nhận lệnh"
      onSubmit={(form) => {
        const agencyName = text(form, 'agency');
        const orderRef = text(form, 'ref');
        const file = pickedFile(form, 'file');
        if (!agencyName || !orderRef) return Promise.resolve('Hãy nhập cơ quan và số lệnh.');
        if (!file) return Promise.resolve('Hãy chọn bản lệnh có chữ ký.');
        return postFile(`enforcement/measure-proposals/${proposalId}/order-file`, file, {
          agencyName,
          orderRef,
        });
      }}
    >
      <Field id={`or-ag-${proposalId}`} label="Cơ quan ra lệnh">
        <Input id={`or-ag-${proposalId}`} name="agency" maxLength={300} />
      </Field>
      <Field id={`or-ref-${proposalId}`} label="Số lệnh">
        <Input id={`or-ref-${proposalId}`} name="ref" maxLength={200} />
      </Field>
      <Field id={`or-file-${proposalId}`} label="Bản lệnh có chữ ký">
        <Input
          id={`or-file-${proposalId}`}
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
        />
      </Field>
    </FormSheet>
  );
}

/** Rút một đề xuất chưa có lệnh. */
export function WithdrawProposalButton({ proposalId }: { readonly proposalId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function withdraw() {
    setBusy(true);
    setError(null);
    try {
      const r = await postJson(`measure-proposals/${proposalId}/withdrawal`, {});
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
      <Button variant="ghost" onClick={withdraw} loading={busy}>
        Rút đề xuất
      </Button>
      {error ? (
        <span role="alert" className="text-[13px] text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** Xem nhãn tài sản nhạy cảm: phải nêu mục đích, mỗi lần xem đều được ghi nhật ký. */
export function RevealLabel({ assetId }: { readonly assetId: string }) {
  const [label, setLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function reveal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const purpose = text(e.currentTarget, 'purpose');
    if (!purpose) return setError(messageFor('PURPOSE_REQUIRED'));
    setBusy(true);
    setError(null);
    try {
      const r = await postJson(`assets/${assetId}/access`, { purpose });
      if (!r.ok) return setError(messageFor(r.code));
      setLabel(r.label ?? '');
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }
  if (label !== null) return <strong>{label}</strong>;
  return (
    <form onSubmit={reveal} className="flex flex-wrap items-center gap-2">
      <Input
        name="purpose"
        aria-label="Mục đích xem"
        placeholder="Mục đích xem nhãn"
        maxLength={500}
      />
      <Button type="submit" variant="secondary" loading={busy}>
        Xem nhãn
      </Button>
      {error ? (
        <span role="alert" className="text-[13px] text-danger">
          {error}
        </span>
      ) : null}
    </form>
  );
}

export function AssetList({
  assets,
  canWrite,
  canOrder,
}: {
  readonly assets: readonly Asset[];
  readonly canWrite: boolean;
  readonly canOrder: boolean;
}) {
  if (assets.length === 0) return <p className="muted">Chưa có tài sản nào.</p>;
  return (
    <ul className="m-0 grid list-none gap-4 p-0">
      {assets.map((a) => (
        <li key={a.id} className="grid gap-2 border-b border-line pb-4 last:border-0 last:pb-0">
          <div className="grid gap-1">
            <span className="text-[13px] text-muted">
              {a.category} · {ASSET_SENSITIVITY_LABEL[a.sensitivity] ?? a.sensitivity}
            </span>
            {a.label !== null ? <strong>{a.label}</strong> : <RevealLabel assetId={a.id} />}
          </div>
          {a.events.length > 0 ? (
            <ul className="m-0 grid list-none gap-1 p-0 text-[13px]">
              {a.events.map((e, i) => (
                <li key={i}>
                  {atFmt.format(new Date(e.at))} · {ASSET_EVENT_KIND_LABEL[e.kind] ?? e.kind}:{' '}
                  {e.note}
                </li>
              ))}
            </ul>
          ) : null}
          {a.proposals.map((p) => (
            <div key={p.id} className="grid gap-1 rounded-lg border border-line p-3">
              <span className="font-semibold">{p.measure}</span>
              <span className="text-[13px] text-muted">{p.rationale}</span>
              <span className="text-[13px]">
                {MEASURE_STATUS_LABEL[p.status] ?? p.status}
                {p.agencyName ? ` · ${p.agencyName}, lệnh số ${p.orderRef ?? ''}` : ''}
              </span>
              {canWrite && p.status === 'PROPOSED' ? (
                <div className="flex flex-wrap gap-2">
                  {canOrder ? <RecordOrderSheet proposalId={p.id} /> : null}
                  <WithdrawProposalButton proposalId={p.id} />
                </div>
              ) : null}
            </div>
          ))}
          {canWrite ? (
            <div className="flex flex-wrap gap-2">
              <AssetEventSheet assetId={a.id} />
              <ProposeMeasureSheet assetId={a.id} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
