'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { DmsThvOption } from '../lib/dms';
import { messageFor } from '../lib/messages';

async function send(method: string, url: string, body?: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.ok) return null;
    const json = (await res.json().catch(() => ({}))) as { code?: string };
    return messageFor(json.code);
  } catch {
    return 'Không kết nối được máy chủ. Vui lòng thử lại.';
  }
}

/** Ghi tên thừa hành viên trên BẢN NHÁP. Ghi tên chưa đủ: chính THV đó phải tự xác nhận trước khi ghi sổ. */
/** Khóa của cột "Thừa hành viên thực hiện" trong cả 4 sổ (S-01, S-02, S-04, S-05). */
const THV_TEXT_KEY = 'thua_hanh_vien';

/** Nơi ghi chữ THV: thuộc tính của hồ sơ (S-02/04/05) hoặc của từng giấy tờ nháp (S-01 Tống đạt). */
export type DmsThvTextTarget =
  | {
      readonly kind: 'case';
      readonly title: string;
      readonly attributes: Record<string, unknown>;
    }
  | {
      readonly kind: 'documents';
      readonly docs: readonly {
        readonly id: string;
        readonly kind: string;
        readonly title: string;
        readonly isOfficial: boolean;
        readonly attributes: Record<string, unknown>;
      }[];
    };

/**
 * Ghi tên thừa hành viên trên BẢN NHÁP. Ghi tên chưa đủ: chính THV đó phải tự xác nhận trước khi ghi sổ.
 * Chữ ghi vào cột THV của sổ: chọn THV thì tự điền tên (sửa được, vd thêm số thẻ); cũng có thể không chọn mà gõ chữ tùy ý.
 */
export function DmsThvPicker({
  caseId,
  options,
  currentId,
  confirmed,
  text = '',
  target = null,
}: {
  readonly caseId: string;
  readonly options: readonly DmsThvOption[];
  readonly currentId: string | null;
  readonly confirmed: boolean | null;
  /** Chữ đang ghi ở cột THV của sổ. */
  readonly text?: string;
  /** Không có thì chỉ ghi tên THV, không có ô chữ (nghiệp vụ không có cột THV). */
  readonly target?: DmsThvTextTarget | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState(text);

  function onPick(userId: string) {
    const picked = options.find((o) => o.userId === userId);
    if (picked) setValue(picked.label);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = String(new FormData(e.currentTarget).get('thv') ?? '');
    const next = value.trim();
    setBusy(true);
    let err = await send('PUT', `/api/dms/cases/${caseId}/thv`, {
      thvUserId: v === '' ? null : v,
    });
    if (!err && target && next !== text.trim()) {
      if (target.kind === 'case') {
        err = await send('PUT', `/api/dms/cases/${caseId}/draft`, {
          title: target.title,
          attributes: { ...target.attributes, [THV_TEXT_KEY]: next },
        });
      } else {
        for (const d of target.docs) {
          err = await send('PUT', `/api/dms/documents/${d.id}/draft`, {
            kind: d.kind,
            title: d.title,
            isOfficial: d.isOfficial,
            attributes: { ...d.attributes, [THV_TEXT_KEY]: next },
          });
          if (err) break;
        }
      }
    }
    setError(err);
    setBusy(false);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="thv-picker" aria-label="Thừa hành viên được ghi tên">
      <label>
        <span>Thừa hành viên được ghi tên</span>
        <select name="thv" defaultValue={currentId ?? ''} onChange={(e) => onPick(e.target.value)}>
          <option value="">Không ghi tên</option>
          {options.map((o) => (
            <option key={o.userId} value={o.userId}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {target ? (
        <label className="thv-picker-text">
          <span>Ghi vào sổ (họ tên, số thẻ)</span>
          <input
            name="thv_text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={2000}
            placeholder="Chọn THV để điền sẵn, hoặc gõ chữ tùy ý"
          />
        </label>
      ) : null}
      <button type="submit" disabled={busy}>
        Lưu
      </button>
      {currentId ? (
        <span className="chip" data-tone={confirmed ? 'ok' : 'warn'}>
          {confirmed ? 'THV đã xác nhận' : 'Chờ THV xác nhận'}
        </span>
      ) : null}
      {target?.kind === 'documents' ? (
        <p className="thv-picker-hint">
          {target.docs.length === 0
            ? 'Chưa có giấy tờ nào: thêm giấy tờ rồi mới ghi được chữ THV vào sổ.'
            : `Chữ này áp dụng cho ${target.docs.length} giấy tờ nháp; từng giấy tờ vẫn sửa riêng được.`}
        </p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}

/** THV bấm xác nhận nội dung đang xem. */
export function DmsThvConfirmButton({
  caseId,
  confirmed,
}: {
  readonly caseId: string;
  readonly confirmed: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (confirmed) return <p role="status">Bạn đã xác nhận nội dung này.</p>;
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(await send('POST', `/api/dms/thv/cases/${caseId}/confirm`));
          setBusy(false);
          router.refresh();
        }}
      >
        Tôi xác nhận nội dung này
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
