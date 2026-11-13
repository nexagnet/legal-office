'use client';

import { useState } from 'react';
import { messageFor } from '../lib/messages';

/**
 * Ô tích "Đã trả kết quả" trong danh sách (N2). Chỉ là dấu hiệu nhìn: không đổi trạng thái hồ sơ, không chặn bước nào.
 * Quyền do máy chủ quyết định; `editable=false` (không có quyền hoặc hồ sơ chưa ghi sổ) thì chỉ hiện trạng thái.
 */
export function ReturnedToggle({
  caseId,
  initial,
  editable,
  caseLabel,
  ariaPrefix = 'Đã trả kết quả hồ sơ',
}: {
  readonly caseId: string;
  readonly initial: boolean;
  readonly editable: boolean;
  /** Số hồ sơ hoặc tên hồ sơ, để đọc được bằng trình đọc màn hình. */
  readonly caseLabel: string;
  /** Câu đọc cho trình đọc màn hình, đứng trước số/tên hồ sơ. */
  readonly ariaPrefix?: string;
}) {
  const [checked, setChecked] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(next: boolean) {
    if (!editable || busy) return;
    setBusy(true);
    setError(null);
    setChecked(next);
    try {
      const res = await fetch(`/api/dms/cases/${encodeURIComponent(caseId)}/returned`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ returned: next }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { code?: string };
        setChecked(!next);
        setError(messageFor(json.code));
      }
    } catch {
      setChecked(!next);
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="dms-returned">
      <input
        type="checkbox"
        checked={checked}
        disabled={!editable || busy}
        onChange={(e) => void change(e.target.checked)}
        aria-label={`${ariaPrefix} ${caseLabel}`}
      />
      {error ? (
        <small role="alert" className="dms-returned-err">
          {error}
        </small>
      ) : null}
    </span>
  );
}
