'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Branch } from '../app/session';
import { messageFor } from '../lib/messages';
import { postJson } from '../lib/post-json';
import { Button } from './ui/button';
import { Field, Input, Select } from './ui/field';
import { Notice, Sheet, SheetBody, SheetFooter } from './ui/sheet';

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(path: string, body: unknown, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      const r = await postJson(path, body);
      if (!r.ok) return setError(messageFor(r.code));
      after?.();
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

/** Mở phiên kiểm kê mới tại một chi nhánh (Admin, Trưởng VP, Thư ký, Văn thư; DB kiểm quyền theo chi nhánh). */
export function StocktakeOpen({
  officeId,
  branches,
}: {
  readonly officeId: string;
  readonly branches: readonly Branch[];
}) {
  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [note, setNote] = useState('');
  const { busy, error, setError, run } = useAction();
  if (branches.length === 0) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>+ Tạo phiên kiểm kê</Button>
      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          setError(null);
        }}
        title="Tạo phiên kiểm kê"
        description="Đếm thực tế theo từng lô. Chênh lệch chỉ ghi vào sổ sau khi Trưởng văn phòng duyệt."
      >
        <SheetBody>
          <Field id="kk-branch" label="Chi nhánh">
            <Select id="kk-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="kk-note" label="Ghi chú (tuỳ chọn)">
            <Input
              id="kk-note"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          {error ? (
            <Notice tone="danger" title="Chưa tạo được">
              {error}
            </Notice>
          ) : null}
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Huỷ
          </Button>
          <Button
            loading={busy}
            onClick={() =>
              void run(
                '/office/stocktakes',
                { officeId, branchId, ...(note.trim() ? { note: note.trim() } : {}) },
                () => setOpen(false),
              )
            }
          >
            Tạo phiên
          </Button>
        </SheetFooter>
      </Sheet>
    </>
  );
}

/** Ghi số đếm thực tế của một lô. Lệch với sổ thì bắt buộc có lý do (DB cũng kiểm). Chỉ số lượng, không đơn giá. */
export function StocktakeCount({
  stocktakeId,
  batchId,
  systemQty,
  countedQty,
  reason,
}: {
  readonly stocktakeId: string;
  readonly batchId: string;
  readonly systemQty: number;
  readonly countedQty: number | null;
  readonly reason: string | null;
}) {
  const [qty, setQty] = useState(countedQty === null ? '' : String(countedQty));
  const [why, setWhy] = useState(reason ?? '');
  const { busy, error, setError, run } = useAction();
  const n = qty.trim() === '' ? null : Number(qty);
  const differs = n !== null && Number.isInteger(n) && n !== systemQty;

  function save() {
    if (n === null || !Number.isInteger(n) || n < 0)
      return setError('Nhập số lượng đếm là số nguyên không âm.');
    if (differs && !why.trim()) return setError('Lệch với sổ sách thì cần nhập lý do.');
    void run(`/office/stocktakes/${stocktakeId}/counts`, {
      batchId,
      countedQty: n,
      ...(why.trim() ? { reason: why.trim() } : {}),
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`kk-q-${batchId}`}>
        Số đếm thực tế
      </label>
      <Input
        id={`kk-q-${batchId}`}
        type="number"
        min={0}
        className="w-24"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
      />
      {differs ? (
        <>
          <label className="sr-only" htmlFor={`kk-r-${batchId}`}>
            Lý do chênh lệch
          </label>
          <Input
            id={`kk-r-${batchId}`}
            className="w-48"
            placeholder="Lý do chênh lệch"
            maxLength={500}
            value={why}
            onChange={(e) => setWhy(e.target.value)}
          />
        </>
      ) : null}
      <Button variant="secondary" loading={busy} onClick={save}>
        Ghi
      </Button>
      {error ? (
        <span role="alert" className="text-xs font-medium text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** Duyệt (ghi phiếu điều chỉnh cho dòng lệch) hoặc từ chối phiên. Chỉ Admin và Trưởng VP; duyệt rồi không đổi lại. */
export function StocktakeDecision({
  stocktakeId,
  enabled,
}: {
  readonly stocktakeId: string;
  readonly enabled: boolean;
}) {
  const { busy, error, run } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        loading={busy}
        disabled={!enabled}
        onClick={() => void run(`/office/stocktakes/${stocktakeId}/decision`, { approve: true })}
      >
        Duyệt và ghi điều chỉnh
      </Button>
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => void run(`/office/stocktakes/${stocktakeId}/decision`, { approve: false })}
      >
        Từ chối
      </Button>
      {error ? (
        <span role="alert" className="text-xs font-medium text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
