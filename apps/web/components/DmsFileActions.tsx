'use client';

import * as Menu from '@radix-ui/react-dropdown-menu';
import { Download, History, MoreHorizontal, Printer, Trash2, Upload, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import { uploadUnclassified } from './DmsCaseActions';
import { DeleteScanButton } from './DeleteScanButton';
import { Button } from './ui/button';
import { Modal } from './ui/dialog';

const ACCEPT = 'application/pdf,image/jpeg,image/png';
const sizeLabel = (n: number) =>
  `${String(Math.max(1, Math.round(n / 1024))).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} KB`;

/** Tệp đã chọn kèm tên người dùng muốn đặt (mặc định là tên tệp). */
interface Picked {
  readonly file: File;
  readonly name: string;
}

/**
 * Hộp thoại "Tải lên" duy nhất của tab Tài liệu (Figma T5): chọn nhiều tệp (có thể đổi tên từng tệp), tải liên tiếp.
 * Không hỏi loại tài liệu, nhóm hay bản scan: mọi tệp vào tài liệu chung "Tài liệu khác" của hồ sơ và tính là bản scan.
 */
export function UploadDialog({
  caseId,
  open,
  onOpenChange,
}: {
  readonly caseId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function add(list: FileList | readonly File[] | null) {
    const next = [...(list ?? [])]
      .filter((f) => f.size > 0)
      .map((file) => ({ file, name: file.name }));
    if (next.length > 0) setFiles((prev) => [...prev, ...next]);
  }
  function close(v: boolean) {
    if (busy) return;
    if (!v) {
      setFiles([]);
      setError(null);
    }
    onOpenChange(v);
  }
  function drop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    add(e.dataTransfer.files);
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (files.length === 0) return setError('Hãy chọn ít nhất một tệp PDF, JPEG hoặc PNG.');
    setBusy(true);
    setError(null);
    try {
      const list = files.map((p) => p.file);
      const names = files.map((p) => p.name);
      const r = await uploadUnclassified(caseId, list, true, names);
      if (r.done > 0) router.refresh();
      if (r.error) {
        setFiles((prev) => prev.slice(r.done));
        setError(r.error);
        return;
      }
      setFiles([]);
      onOpenChange(false);
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={close} title="Tải lên tài liệu">
      <form onSubmit={submit} className="grid gap-4" aria-label="Tải tài liệu lên">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={drop}
          className="grid justify-items-center gap-1.5 rounded-xl border border-dashed border-accent bg-accent-soft/50 px-4 py-5 text-center"
        >
          <Upload size={22} aria-hidden="true" className="text-accent" />
          <p className="m-0 text-sm font-semibold">Kéo thả tệp vào đây</p>
          <p className="m-0 text-xs text-muted">PDF, JPEG, PNG · không giới hạn số tệp</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            aria-label="Chọn tệp"
            className="sr-only"
            onChange={(e) => {
              add(e.currentTarget.files);
              e.currentTarget.value = '';
            }}
          />
          <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()}>
            Chọn tệp
          </Button>
        </div>
        {files.length > 0 ? (
          <ul className="m-0 grid list-none gap-2 p-0" aria-label="Tệp đã chọn">
            {files.map((p, i) => (
              <li
                key={`${p.file.name}-${i}`}
                className="flex items-center gap-2 rounded-lg bg-head py-1 pr-1 pl-3 text-sm"
              >
                <input
                  type="text"
                  value={p.name}
                  maxLength={200}
                  aria-label={`Tên tài liệu cho ${p.file.name}`}
                  title="Bấm để đổi tên"
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1.5 text-sm font-medium text-ink hover:border-line focus:border-accent focus:bg-surface focus:outline-none"
                  onChange={(e) => {
                    const name = e.target.value;
                    setFiles((prev) => prev.map((x, j) => (j === i ? { ...x, name } : x)));
                  }}
                  onBlur={() =>
                    setFiles((prev) =>
                      prev.map((x, j) =>
                        j === i && x.name.trim() === '' ? { ...x, name: x.file.name } : x,
                      ),
                    )
                  }
                />
                <span className="shrink-0 text-xs text-muted">{sizeLabel(p.file.size)}</span>
                <button
                  type="button"
                  aria-label={`Bỏ ${p.file.name}`}
                  className="grid size-8 shrink-0 place-items-center rounded-md text-muted hover:bg-surface"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {error ? (
          <p role="alert" className="m-0 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => close(false)}>
            Hủy
          </Button>
          <Button type="submit" loading={busy}>
            {files.length > 0 ? `Tải lên ${files.length} tệp` : 'Tải lên'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Nút "Tải lên" duy nhất ở đầu danh sách (và ở trạng thái rỗng), mở `UploadDialog`. */
export function UploadButton({ caseId }: { readonly caseId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Upload size={16} aria-hidden="true" />
        Tải lên
      </Button>
      <UploadDialog caseId={caseId} open={open} onOpenChange={setOpen} />
    </>
  );
}

export interface CompareFile {
  readonly id: string;
  readonly label: string;
  readonly version: number;
  readonly sizeKb: string;
  readonly date: string;
}

function CompareDialog({
  older,
  newer,
  open,
  onOpenChange,
}: {
  readonly older: CompareFile;
  readonly newer: CompareFile;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      wide
      title="So sánh phiên bản tệp"
      description={newer.label}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {[
          { f: older, tag: 'Bản cũ' },
          { f: newer, tag: 'Hiện tại' },
        ].map(({ f, tag }) => (
          <figure key={f.id} className="m-0 grid gap-2">
            <figcaption className="flex items-center gap-2 text-[13px] font-semibold">
              v{f.version} · {f.date} · {f.sizeKb}
              <span className="rounded-full bg-head px-2 py-0.5 text-[11px] font-semibold text-muted">
                {tag}
              </span>
            </figcaption>
            {open ? (
              <iframe
                title={`Tệp ${f.label} v${f.version}`}
                src={`/api/dms/files/${f.id}/download?inline=1`}
                className="h-[420px] w-full rounded-xl border border-line bg-surface"
              />
            ) : null}
          </figure>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button asChild variant="secondary">
          <a href={`/api/dms/files/${older.id}/download`} download>
            Tải v{older.version}
          </a>
        </Button>
        <Button asChild variant="secondary">
          <a href={`/api/dms/files/${newer.id}/download`} download>
            Tải v{newer.version}
          </a>
        </Button>
        <Button type="button" onClick={() => onOpenChange(false)}>
          Đóng
        </Button>
      </div>
    </Modal>
  );
}

const itemClass =
  'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink outline-none data-[highlighted]:bg-accent-soft';

/**
 * Hành động của một tệp (Figma T1/T2): "Tải" là hành động chính, phần còn lại nằm trong menu ⋯.
 * `preview` là thanh công cụ khung xem trước: nút chữ "Tải về" và "In" rồi menu ⋯.
 */
export function FileActions({
  file,
  canDelete,
  older,
  variant = 'row',
}: {
  readonly file: CompareFile & { readonly isScan: boolean };
  /** Có quyền xóa scan (dms.scan.delete) và tệp là bản scan. */
  readonly canDelete: boolean;
  /** Phiên bản liền trước của tệp (cùng nhãn), nếu có. */
  readonly older: CompareFile | null;
  readonly variant?: 'row' | 'preview';
}) {
  const [compareOpen, setCompareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const download = `/api/dms/files/${file.id}/download`;
  const later = (fn: () => void) => () => setTimeout(fn, 0);
  const preview = variant === 'preview';
  const hasMenu = !preview || older !== null || canDelete;

  return (
    <div className="relative z-10 flex shrink-0 items-center gap-1">
      {preview ? (
        <>
          <Button asChild variant="secondary">
            <a href={download} download>
              <Download size={16} aria-hidden="true" />
              Tải về
            </a>
          </Button>
          <Button asChild variant="secondary">
            <a href={`${download}?inline=1`} target="_blank" rel="noreferrer">
              <Printer size={16} aria-hidden="true" />
              In
            </a>
          </Button>
        </>
      ) : (
        <a
          href={download}
          download
          aria-label={`Tải ${file.label}`}
          title="Tải về"
          className="grid size-9 place-items-center rounded-lg text-muted hover:bg-accent-soft hover:text-accent"
        >
          <Download size={18} aria-hidden="true" />
        </a>
      )}
      {hasMenu ? (
        <Menu.Root>
          <Menu.Trigger
            aria-label={`Thêm hành động cho ${file.label}`}
            className="grid size-9 place-items-center rounded-lg text-muted hover:bg-accent-soft hover:text-accent data-[state=open]:bg-accent-soft"
          >
            <MoreHorizontal size={18} aria-hidden="true" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content
              align="end"
              sideOffset={6}
              className="z-50 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-xl"
            >
              {older ? (
                <Menu.Item className={itemClass} onSelect={later(() => setCompareOpen(true))}>
                  <History size={16} aria-hidden="true" className="text-muted" />
                  Xem phiên bản cũ (v{older.version})
                </Menu.Item>
              ) : null}
              {preview ? null : (
                <Menu.Item
                  className={itemClass}
                  onSelect={() => window.open(`${download}?inline=1`, '_blank', 'noreferrer')}
                >
                  <Printer size={16} aria-hidden="true" className="text-muted" />
                  In
                </Menu.Item>
              )}
              {canDelete ? (
                <>
                  <Menu.Separator className="my-1 h-px bg-line" />
                  <Menu.Item
                    className={`${itemClass} !text-danger`}
                    onSelect={later(() => setDeleteOpen(true))}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    Xóa scan
                  </Menu.Item>
                </>
              ) : null}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      ) : null}
      {older ? (
        <CompareDialog
          older={older}
          newer={file}
          open={compareOpen}
          onOpenChange={setCompareOpen}
        />
      ) : null}
      {canDelete ? (
        <DeleteScanButton
          kind="document"
          fileId={file.id}
          label={file.label}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
        />
      ) : null}
    </div>
  );
}
