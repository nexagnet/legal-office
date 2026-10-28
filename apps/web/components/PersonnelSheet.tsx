'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { messageFor } from '../lib/messages';
import { insuranceLabel, type PersonnelRow, type PersonnelVersion } from '../lib/personnel-view';
import type { Branch } from '../app/session';
import { Button } from './ui/button';
import { Field, Input, Select } from './ui/field';
import { Notice, Sheet, SheetBody, SheetFooter } from './ui/sheet';

const day = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' });

interface Values {
  fullName: string;
  gender: string;
  specialty: string;
  branchId: string;
  executorDecisionRef: string;
  bailiffDecisionRef: string;
  laborContractRef: string;
  insurance: '' | 'yes' | 'no';
  insuranceNote: string;
  isOfficeHead: boolean;
  isPartner: boolean;
  active: boolean;
  note: string;
}

function initial(p: PersonnelRow | null, branches: readonly Branch[]): Values {
  return {
    fullName: p?.full_name ?? '',
    gender: p?.gender ?? 'M',
    specialty: p?.specialty ?? '',
    branchId: p?.branch_id ?? branches[0]?.id ?? '',
    executorDecisionRef: p?.executor_decision_ref ?? '',
    bailiffDecisionRef: p?.bailiff_decision_ref ?? '',
    laborContractRef: p?.labor_contract_ref ?? '',
    insurance: p?.insurance_purchased == null ? '' : p.insurance_purchased ? 'yes' : 'no',
    insuranceNote: p?.insurance_note ?? '',
    isOfficeHead: p?.is_office_head ?? false,
    isPartner: p?.is_partner ?? false,
    active: (p?.work_status ?? 'ACTIVE') === 'ACTIVE',
    note: p?.note ?? '',
  };
}

const blank = (s: string) => (s.trim() === '' ? null : s.trim());

/**
 * Cập nhật hồ sơ lao động trong ngăn kéo (Figma N16 O10). Mỗi lần lưu là một phiên bản mới của sổ S-06,
 * phiên bản cũ giữ nguyên. Bảo hiểm chỉ ghi tình trạng và ghi chú, không có số tiền. Quyền do máy chủ kiểm.
 */
export function PersonnelSheet({
  officeId,
  branches,
  person,
  trigger,
}: {
  readonly officeId: string;
  readonly branches: readonly Branch[];
  readonly person: PersonnelRow | null;
  readonly trigger: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Values>(() => initial(person, branches));
  const [errors, setErrors] = useState<Partial<Record<'fullName' | 'branchId', string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [versions, setVersions] = useState<PersonnelVersion[] | 'error' | null>(null);
  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((p) => ({ ...p, [k]: val }));
  const next = (person?.version ?? 0) + 1;

  function change(o: boolean) {
    setOpen(o);
    if (o) {
      setV(initial(person, branches));
      setErrors({});
      setError(null);
      setVersions(null);
    }
  }

  async function loadVersions() {
    if (!person) return;
    try {
      const res = await fetch(
        `/api/office/personnel/${person.person_id}/versions?officeId=${encodeURIComponent(officeId)}`,
      );
      setVersions(res.ok ? ((await res.json()) as PersonnelVersion[]) : 'error');
    } catch {
      setVersions('error');
    }
  }

  async function submit() {
    const e: typeof errors = {};
    if (!v.fullName.trim()) e.fullName = 'Nhập họ tên.';
    if (!v.branchId) e.branchId = 'Chọn chi nhánh.';
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/office/personnel', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          officeId,
          personId: person?.person_id ?? null,
          branchId: v.branchId,
          fullName: v.fullName.trim(),
          gender: v.gender,
          specialty: blank(v.specialty),
          bailiffDecisionRef: blank(v.bailiffDecisionRef),
          executorDecisionRef: blank(v.executorDecisionRef),
          isOfficeHead: v.isOfficeHead,
          isPartner: v.isPartner,
          laborContractRef: blank(v.laborContractRef),
          insurancePurchased: v.insurance === '' ? null : v.insurance === 'yes',
          insuranceNote: blank(v.insuranceNote),
          contributing: person?.contributing ?? null,
          contributionNote: person?.contribution_note ?? null,
          note: blank(v.note),
          workStatus: v.active ? 'ACTIVE' : 'LEFT',
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
      <Button variant={person ? 'ghost' : 'primary'} onClick={() => change(true)}>
        {trigger}
      </Button>
      <Sheet
        open={open}
        onOpenChange={change}
        title={person ? 'Cập nhật hồ sơ lao động' : 'Thêm hồ sơ lao động'}
        description={
          person
            ? `Lưu thành phiên bản v${next} của ${person.full_name}. Phiên bản cũ vẫn giữ.`
            : 'Lưu thành phiên bản v1. Mỗi lần lưu sau là một phiên bản mới, không ghi đè.'
        }
      >
        <SheetBody>
          <div className="grid grid-cols-2 gap-3">
            <Field id="pl-name" label="Họ tên" error={errors.fullName}>
              <Input
                id="pl-name"
                value={v.fullName}
                invalid={!!errors.fullName}
                onChange={(e) => set('fullName', e.target.value)}
              />
            </Field>
            <Field id="pl-gender" label="Giới tính">
              <Select
                id="pl-gender"
                value={v.gender}
                onChange={(e) => set('gender', e.target.value)}
              >
                <option value="M">Nam</option>
                <option value="F">Nữ</option>
              </Select>
            </Field>
            <Field id="pl-spec" label="Chuyên môn">
              <Input
                id="pl-spec"
                value={v.specialty}
                onChange={(e) => set('specialty', e.target.value)}
              />
            </Field>
            <Field id="pl-branch" label="Chi nhánh" error={errors.branchId}>
              <Select
                id="pl-branch"
                value={v.branchId}
                invalid={!!errors.branchId}
                onChange={(e) => set('branchId', e.target.value)}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field id="pl-exec" label="Quyết định bổ nhiệm Thừa hành viên (số, ngày)">
            <Input
              id="pl-exec"
              value={v.executorDecisionRef}
              onChange={(e) => set('executorDecisionRef', e.target.value)}
            />
          </Field>
          <Field id="pl-bailiff" label="Quyết định bổ nhiệm Thừa phát lại (số, ngày)">
            <Input
              id="pl-bailiff"
              value={v.bailiffDecisionRef}
              onChange={(e) => set('bailiffDecisionRef', e.target.value)}
            />
          </Field>
          <Field id="pl-labor" label="Hợp đồng lao động (số, ngày)">
            <Input
              id="pl-labor"
              placeholder="Nhập số và ngày hợp đồng"
              value={v.laborContractRef}
              onChange={(e) => set('laborContractRef', e.target.value)}
            />
          </Field>
          <fieldset className="grid gap-1.5">
            <legend className="text-[13px] font-semibold text-ink">
              Bảo hiểm (chỉ ghi tình trạng và ghi chú)
            </legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['yes', 'Đã mua'],
                  ['no', 'Chưa mua'],
                  ['', 'Chưa ghi'],
                ] as const
              ).map(([val, label]) => (
                <label
                  key={label}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line-strong px-4 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
                >
                  <input
                    type="radio"
                    name="pl-insurance"
                    checked={v.insurance === val}
                    onChange={() => set('insurance', val)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <Field id="pl-ins-note" label="Ghi chú bảo hiểm">
            <Input
              id="pl-ins-note"
              value={v.insuranceNote}
              onChange={(e) => set('insuranceNote', e.target.value)}
            />
          </Field>
          <div className="grid gap-2">
            {(
              [
                ['isOfficeHead', 'Trưởng văn phòng'],
                ['isPartner', 'Thành viên góp vốn'],
                ['active', 'Đang làm việc tại văn phòng'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" checked={v[k]} onChange={(e) => set(k, e.target.checked)} />
                {label}
              </label>
            ))}
          </div>
          <Field id="pl-note" label="Ghi chú">
            <Input id="pl-note" value={v.note} onChange={(e) => set('note', e.target.value)} />
          </Field>
          {person ? (
            <div className="grid gap-2">
              {versions === null ? (
                <Button variant="secondary" onClick={() => void loadVersions()}>
                  Xem các phiên bản cũ
                </Button>
              ) : versions === 'error' ? (
                <p role="alert" className="text-sm text-danger">
                  Không tải được các phiên bản.
                </p>
              ) : (
                <ol className="grid gap-1 text-sm" aria-label="Các phiên bản của hồ sơ">
                  {versions.map((x) => (
                    <li key={x.version}>
                      <strong>v{x.version}</strong> · {day.format(new Date(x.saved_at))} ·{' '}
                      {x.work_status === 'ACTIVE' ? 'Đang làm' : 'Đã nghỉ'} · Bảo hiểm:{' '}
                      {insuranceLabel(x.insurance_purchased)}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : null}
          {error ? (
            <Notice tone="danger" title="Chưa lưu được">
              {error}
            </Notice>
          ) : null}
        </SheetBody>
        <SheetFooter>
          <Button variant="secondary" onClick={() => change(false)}>
            Huỷ
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            Lưu phiên bản mới
          </Button>
        </SheetFooter>
      </Sheet>
    </>
  );
}
