'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { dateOnly, numberPrefix, type DmsBookColumn } from '../lib/dms';
import { NumberDateInput } from './NumberDateInput';
import { messageFor } from '../lib/messages';
import { Button } from './ui/button';
import { Input, Textarea } from './ui/field';
import { Modal } from './ui/dialog';

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/**
 * Admin sửa hồ sơ hoặc tài liệu ĐÃ ghi sổ (N5): nhân viên chỉ tải thêm scan, mọi thay đổi nội dung do Admin sửa trực tiếp.
 * Bắt buộc lý do. Mỗi lần sửa thêm một phiên bản mới (xem tab Phiên bản), bản gốc giữ nguyên. Chỉ gửi các trường đã đổi;
 * xóa trống một ô nghĩa là bỏ giá trị đó. Quyền do máy chủ kiểm (ADMIN_ONLY); nút chỉ hiện với Admin.
 */
export function DmsAdminEdit({
  target,
  id,
  columns,
  current,
  currentTitle,
  withPhone = false,
  buttonLabel = 'Sửa hồ sơ (Admin)',
  domain,
  caseNumber,
}: {
  readonly target: 'case' | 'document';
  readonly id: string;
  readonly columns: readonly DmsBookColumn[];
  readonly current: Record<string, unknown>;
  /** Có thì cho sửa cả tiêu đề (hồ sơ). */
  readonly currentTitle?: string;
  /** Hồ sơ 4 nghiệp vụ có SĐT khách hàng (N1). */
  readonly withPhone?: boolean;
  readonly buttonLabel?: string;
  /** Mã nghiệp vụ và số hồ sơ: chữ mờ trước ô "số, ngày" của cột tự cấp số. */
  readonly domain?: string;
  readonly caseNumber?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const reason = String(f.get('reason') ?? '').trim();
    if (!reason) return setError('Cần nhập lý do sửa.');
    const keys = [...columns.map((c) => c.key), ...(withPhone ? ['so_dien_thoai'] : [])];
    const attributes: Record<string, string | null> = {};
    const dateKeys = new Set(columns.filter((c) => c.autoNumber && domain).map((c) => c.key));
    for (const key of keys) {
      const next = String(f.get(key) ?? '').trim();
      const before = dateKeys.has(key) ? dateOnly(current[key]) : str(current[key]).trim();
      if (next !== before) attributes[key] = next === '' ? null : next;
    }
    const title = currentTitle !== undefined ? String(f.get('title') ?? '').trim() : '';
    const titleChanged = currentTitle !== undefined && title !== '' && title !== currentTitle;
    if (Object.keys(attributes).length === 0 && !titleChanged)
      return setError('Chưa có thay đổi nào để lưu.');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dms/${target === 'case' ? 'cases' : 'documents'}/${id}/admin-edit`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...(titleChanged ? { title } : {}),
            attributes,
            reason,
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok)
        return setError(
          res.status === 400 && !json.code
            ? 'Thông tin chưa hợp lệ, kiểm tra lại số điện thoại.'
            : messageFor(json.code),
        );
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
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {buttonLabel}
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={buttonLabel}
        description="Sửa trực tiếp, có lý do và lưu thành phiên bản mới. Bản gốc khi ghi sổ vẫn được giữ."
      >
        <form onSubmit={submit} className="grid gap-3" aria-label={buttonLabel}>
          {currentTitle !== undefined ? (
            <label className="grid gap-1 text-[13px] font-semibold">
              Tên hồ sơ
              <Input name="title" defaultValue={currentTitle} maxLength={500} />
            </label>
          ) : null}
          {withPhone ? (
            <label className="grid gap-1 text-[13px] font-semibold">
              SĐT khách hàng
              <Input
                name="so_dien_thoai"
                type="tel"
                inputMode="tel"
                maxLength={20}
                defaultValue={str(current.so_dien_thoai)}
              />
            </label>
          ) : null}
          {columns.map((c) => (
            <label key={c.key} className="grid gap-1 text-[13px] font-semibold">
              {c.group ? `${c.group} · ` : ''}
              {c.heading}
              {c.autoNumber && domain ? (
                <NumberDateInput
                  name={c.key}
                  prefix={numberPrefix(domain, new Date().getFullYear(), caseNumber)}
                  defaultValue={dateOnly(current[c.key])}
                />
              ) : (
                <Input name={c.key} defaultValue={str(current[c.key])} maxLength={2000} />
              )}
            </label>
          ))}
          <label className="grid gap-1 text-[13px] font-semibold">
            Lý do sửa
            <Textarea name="reason" required maxLength={1000} rows={3} />
          </label>
          {error ? <p role="alert">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button type="submit" loading={busy}>
              Lưu thay đổi
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
