'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import type { DmsBookColumn } from '../lib/dms';
import { numberPrefix } from '../lib/dms-number';
import { NumberDateInput } from './NumberDateInput';
import { messageFor } from '../lib/messages';
import { Button } from './ui/button';
import { Input } from './ui/field';

/**
 * Trang tạo hồ sơ theo Figma "Tạo hồ sơ" (khối A thông tin, B tài liệu, C thông tin hệ thống, Hủy / Lưu nháp).
 * Chỉ tạo BẢN NHÁP: số hồ sơ và STT cấp khi xác nhận lưu chính thức (N3, N8). Tài liệu đính kèm cần hồ sơ đã có,
 * nên tải lên ở trang chi tiết ngay sau khi lưu nháp. Quyền do máy chủ kiểm.
 */
export function NewDmsCasePage({
  officeId,
  domainCode,
  domainLabel,
  bookCode,
  columns,
  creatorName,
  createdOn,
  cancelHref,
  redirectBase,
}: {
  readonly officeId: string;
  readonly domainCode: string;
  readonly domainLabel: string;
  readonly bookCode: string;
  /** Cột nhập tay của sổ (chỉ sổ mà mỗi hồ sơ là một dòng); sổ S-01 nhập ở từng giấy tờ nên để trống. */
  readonly columns: readonly DmsBookColumn[];
  readonly creatorName: string;
  /** Ngày hiện tại theo giờ Việt Nam, đã định dạng. */
  readonly createdOn: string;
  readonly cancelHref: string;
  readonly redirectBase: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [branches, setBranches] = useState<readonly { id: string; name: string }[]>([]);

  // Chi nhánh người này được cấp. Một chi nhánh: máy chủ tự gắn. Nhiều chi nhánh: phải chọn. Lỗi tải: để máy chủ quyết định.
  useEffect(() => {
    let alive = true;
    fetch(`/api/dms/me/branches?officeId=${encodeURIComponent(officeId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ rows: { id: string; name: string }[] }>) : null))
      .then((b) => {
        if (alive && b) setBranches(b.rows);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [officeId]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const text = (name: string) => {
      const el = form.elements.namedItem(name);
      return el instanceof HTMLInputElement || el instanceof HTMLSelectElement
        ? el.value.trim()
        : '';
    };
    const attributes: Record<string, unknown> = {};
    for (const c of columns) if (text(c.key)) attributes[c.key] = text(c.key);
    if (text('note')) attributes.note = text('note');
    // SĐT khách hàng (N1): chỉ gửi khi có nhập; không vào sổ.
    if (text('phone')) attributes.so_dien_thoai = text('phone');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/dms/cases', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          officeId,
          domain: domainCode,
          title: text('title'),
          attributes,
          ...(text('branch') ? { branchId: text('branch') } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string; label?: string };
      if (!res.ok)
        return setError(
          res.status === 400 && !json.code
            ? 'Thông tin chưa hợp lệ, kiểm tra lại số điện thoại.'
            : messageFor(json.code),
        );
      router.push(json.label ? `${redirectBase}/${json.label}` : cancelHref);
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label={`Tạo hồ sơ ${domainLabel}`} className="grid gap-4">
      <p className="rounded-xl bg-[#fdf0d5] px-4 py-2 text-sm text-[#5a3d00]">
        <strong>Bản nháp</strong> · Chưa ghi Sổ {bookCode} chính thức. Chỉnh sửa tự do cho đến khi
        bấm "Xác nhận lưu chính thức"; chưa cấp số hồ sơ, chưa vào xuất sổ.
      </p>

      <section aria-labelledby="new-a" className="rounded-2xl bg-surface p-5 shadow-sm">
        <h2 id="new-a" className="font-serif text-lg font-bold">
          A. Thông tin {domainLabel} — phục vụ Sổ {bookCode}
        </h2>
        <div className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-[13px] font-semibold sm:col-span-2">
            Tên hồ sơ
            <Input name="title" required maxLength={500} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            SĐT khách hàng
            <Input
              name="phone"
              type="tel"
              inputMode="tel"
              maxLength={20}
              pattern="\+?[0-9 .\(\)\-]{8,20}"
              title="Số điện thoại 8-15 chữ số, có thể có dấu cách, chấm, gạch, ngoặc hoặc +84"
            />
            <span className="text-xs font-normal text-muted">Không in ra sổ.</span>
          </label>
          {branches.length > 1 ? (
            <label className="flex flex-col gap-1 text-[13px] font-semibold">
              Chi nhánh
              <select name="branch" required defaultValue="">
                <option value="" disabled>
                  Chọn chi nhánh
                </option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {columns.map((c) => (
            <label key={c.key} className="flex flex-col gap-1 text-[13px] font-semibold">
              <span>
                Cột {c.no}: {c.group ? `${c.group} · ` : ''}
                {c.heading}
              </span>
              {c.autoNumber ? (
                <NumberDateInput
                  name={c.key}
                  prefix={numberPrefix(domainCode, new Date().getFullYear())}
                />
              ) : (
                <Input
                  name={c.key}
                  maxLength={2000}
                  placeholder={c.tick ? 'Gõ x nếu có' : undefined}
                />
              )}
            </label>
          ))}
          <label className="flex flex-col gap-1 text-[13px] font-semibold sm:col-span-2">
            Ghi chú
            <Input name="note" maxLength={1000} />
          </label>
        </div>
        <p className="mt-3 rounded-lg bg-[#eef3fb] px-3 py-2 text-[13px]">
          Số hồ sơ tự cấp khi xác nhận lưu chính thức, trùng phần đầu với STT (STT 30 →
          030/2026/VB-TPL). STT và số về 01 vào ngày đầu năm mới.
        </p>
      </section>

      <section aria-labelledby="new-b" className="rounded-2xl bg-surface p-5 shadow-sm">
        <h2 id="new-b" className="font-serif text-lg font-bold">
          B. Tài liệu đính kèm
        </h2>
        <p className="mt-2 text-sm">
          Tải bản scan và tài liệu ở trang chi tiết ngay sau khi lưu nháp. Hồ sơ cần tồn tại trước
          thì tài liệu mới gắn vào được.
        </p>
      </section>

      <section aria-labelledby="new-c" className="rounded-2xl bg-surface p-5 shadow-sm">
        <h2 id="new-c" className="font-serif text-lg font-bold">
          C. Thông tin hệ thống — tự động
        </h2>
        <dl className="mt-3 grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">Số hồ sơ</dt>
            <dd className="font-semibold">Tự cấp khi xác nhận</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Trạng thái</dt>
            <dd className="font-semibold">Bản nháp</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Người tạo</dt>
            <dd className="font-semibold">{creatorName}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Ngày tạo</dt>
            <dd className="font-semibold">{createdOn}</dd>
          </div>
        </dl>
      </section>

      {error ? (
        <p role="alert" className="text-sm">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-3">
        <Button asChild variant="secondary">
          <Link className="no-underline" href={cancelHref}>
            Hủy
          </Link>
        </Button>
        <Button type="submit" loading={busy}>
          Lưu nháp
        </Button>
      </div>
    </form>
  );
}
