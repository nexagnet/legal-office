'use client';

import { useEffect, useRef, useState } from 'react';
import {
  LEGACY_BROWSER_MAX_BYTES,
  legacyOcrLabel,
  legacyRelPath,
  legacyUploadMessage,
  uploadLegacyFile,
  type LegacyUploadDeps,
} from '../lib/legacy-upload';

type Phase = 'queued' | 'hash' | 'prepare' | 'put' | 'complete' | 'done' | 'error';
interface Item {
  readonly key: number;
  readonly file: File;
  phase: Phase;
  progress: number;
  code?: string;
  dedup?: boolean;
  fileId?: string | null;
  ocr?: string;
}

const PHASE_LABEL: Record<Phase, string> = {
  queued: 'Chờ',
  hash: 'Đang kiểm tra nội dung…',
  prepare: 'Đang chuẩn bị…',
  put: 'Đang tải lên',
  complete: 'Đang đăng ký…',
  done: 'Đã lưu',
  error: 'Lỗi',
};

/**
 * Tải tài liệu cũ lên từng tệp một: tệp đi thẳng từ trình duyệt lên kho R2/S3, không qua máy chủ.
 * Mỗi tệp một đợt riêng, tự đóng khi xong; tệp lỗi bấm Thử lại. `ocrOn` = máy chủ đang chạy OCR tài liệu cũ (hiện cột trạng thái OCR).
 */
export function LegacyUploader({
  officeId,
  ocrOn,
  deps,
}: {
  readonly officeId: string;
  readonly ocrOn: boolean;
  readonly deps?: LegacyUploadDeps;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [folder, setFolder] = useState('');
  const [batchErr, setBatchErr] = useState<string | null>(null);
  const batch = useRef<string | null>(null);
  const seq = useRef(0);
  const running = useRef(false);
  const queue = useRef<number[]>([]);
  const all = useRef<Item[]>([]);
  const folderAt = useRef(new Map<number, string>());

  const patch = (key: number, p: Partial<Item>) => {
    all.current = all.current.map((i) => (i.key === key ? { ...i, ...p } : i));
    setItems(all.current);
  };

  async function ensureBatch(): Promise<string | null> {
    if (batch.current) return batch.current;
    const res = await fetch('/api/dms/legacy/batches', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        officeId,
        label: `Tải từ giao diện ${new Date().toLocaleString('vi-VN')}`,
        ocr: true,
      }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => ({}))) as
      | { ok?: boolean; label?: string; code?: string }
      | undefined;
    if (!res || !res.ok || json?.ok === false || !json?.label) {
      setBatchErr(legacyUploadMessage(json?.code ?? 'NETWORK'));
      return null;
    }
    batch.current = json.label;
    return json.label;
  }

  // Mỗi tệp một đợt riêng: đóng ngay khi tệp xong, tệp sau mở đợt mới.
  async function closeBatch() {
    const label = batch.current;
    batch.current = null;
    if (!label) return;
    await fetch(`/api/dms/legacy/batches/${label}/close`, {
      method: 'POST',
      credentials: 'same-origin',
    }).catch(() => null);
  }

  async function pump() {
    if (running.current) return;
    running.current = true;
    try {
      for (let key = queue.current.shift(); key !== undefined; key = queue.current.shift()) {
        const item = all.current.find((i) => i.key === key);
        if (!item) continue;
        const b = await ensureBatch();
        if (!b) {
          patch(key, { phase: 'error', code: 'BATCH_NOT_FOUND' });
          continue;
        }
        const rel = legacyRelPath(folderAt.current.get(key) ?? '', item.file.name);
        const r = await uploadLegacyFile(
          b,
          item.file,
          rel,
          {
            onStep: (s) => patch(key, { phase: s }),
            onProgress: (f) => patch(key, { progress: f }),
          },
          deps,
        );
        await closeBatch();
        patch(
          key,
          r.ok
            ? {
                phase: 'done',
                progress: 1,
                dedup: r.deduplicated,
                fileId: r.fileId ?? null,
                ocr: ocrOn ? 'PENDING' : undefined,
              }
            : { phase: 'error', code: r.code },
        );
      }
    } finally {
      running.current = false;
    }
  }

  function add(files: FileList | null) {
    if (!files?.length) return;
    const fresh: Item[] = [...files].slice(0, 1).map((file) => {
      seq.current += 1;
      folderAt.current.set(seq.current, folder);
      return { key: seq.current, file, phase: 'queued', progress: 0 };
    });
    all.current = [...all.current, ...fresh];
    setItems(all.current);
    queue.current.push(...fresh.map((i) => i.key));
    void pump();
  }

  function retry(key: number) {
    patch(key, { phase: 'queued', progress: 0, code: undefined });
    queue.current.push(key);
    void pump();
  }

  // Hỏi trạng thái OCR của các tệp đã lưu cho tới khi xong.
  useEffect(() => {
    if (!ocrOn) return;
    const t = setInterval(async () => {
      const pending = all.current.filter(
        (i) =>
          i.fileId &&
          i.phase === 'done' &&
          i.ocr !== 'DONE' &&
          i.ocr !== 'FAILED' &&
          i.ocr !== 'SKIPPED' &&
          i.ocr !== 'NONE',
      );
      if (!pending.length) return;
      const ids = pending.map((i) => i.fileId).join(',');
      const res = await fetch(
        `/api/dms/legacy/ocr-status?officeId=${encodeURIComponent(officeId)}&ids=${encodeURIComponent(ids)}`,
        { credentials: 'same-origin' },
      ).catch(() => null);
      if (!res?.ok) return;
      const body = (await res.json()) as { rows: { file_id: string; status: string }[] };
      for (const row of body.rows) {
        const it = all.current.find((i) => i.fileId === row.file_id);
        if (it) patch(it.key, { ocr: row.status });
      }
    }, 5000);
    return () => clearInterval(t);
  }, [ocrOn, officeId]);

  return (
    <div className="card form">
      <label>
        Thư mục lưu (tuỳ chọn, ví dụ 2019/Hợp đồng)
        <input value={folder} onChange={(e) => setFolder(e.target.value)} maxLength={300} />
      </label>
      <label>
        Chọn tệp (tối đa {LEGACY_BROWSER_MAX_BYTES / 1024 ** 2} MB)
        <input
          type="file"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />
      </label>
      {batchErr ? (
        <p role="alert" className="error">
          {batchErr}
        </p>
      ) : null}
      {items.length > 0 ? (
        <table>
          <caption className="sr-only">Tiến độ tải lên</caption>
          <thead>
            <tr>
              <th scope="col">Tệp</th>
              <th scope="col">Trạng thái</th>
              {ocrOn ? <th scope="col">OCR</th> : null}
              <th scope="col">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.key}>
                <th scope="row">{i.file.name}</th>
                <td>
                  {i.phase === 'error' ? (
                    <span role="alert">{legacyUploadMessage(i.code)}</span>
                  ) : i.phase === 'put' ? (
                    <progress max={1} value={i.progress} aria-label={`Đang tải ${i.file.name}`} />
                  ) : (
                    PHASE_LABEL[i.phase]
                  )}
                  {i.phase === 'done' && i.dedup ? ' (nội dung đã có sẵn, không tải lại)' : ''}
                </td>
                {ocrOn ? <td>{i.ocr ? legacyOcrLabel(i.ocr) : '—'}</td> : null}
                <td>
                  {i.phase === 'error' &&
                  !['EMPTY_FILE', 'FILE_TOO_BIG', 'FILE_TOO_LARGE', 'PATH_CONFLICT'].includes(
                    i.code ?? '',
                  ) ? (
                    <button type="button" className="btn-link" onClick={() => retry(i.key)}>
                      Thử lại
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <p className="muted">
        Tệp đã lưu không xóa, không sửa được. Tệp trùng nội dung chỉ lưu một lần.
        {ocrOn ? ' PDF và ảnh được OCR để tìm theo nội dung.' : ''}
      </p>
    </div>
  );
}
