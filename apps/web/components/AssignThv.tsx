'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { messageFor } from '../lib/messages';

export interface ThvOption {
  readonly userId: string;
  readonly label: string;
}
interface Props {
  readonly caseId: string;
  readonly options: readonly ThvOption[];
  readonly currentThvId: string | null;
  /** Có tên hồ sơ thì dựng bố cục màn phân công (Figma 16:2); không có thì là biểu mẫu gọn. */
  readonly caseTitle?: string;
}

/** Admin giao hoặc đổi THV phụ trách. Đổi THV bắt buộc có lý do (lịch sử bất biến ở DB). */
export function AssignThv({ caseId, options, currentThvId, caseTitle }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const reason = String(f.get('reason') ?? '').trim();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/vibang/cases/${caseId}/responsible-thv`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          thvUserId: String(f.get('thv')),
          ...(reason ? { reason } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) return setError(messageFor(json.code));
      setNotice('Đã giao THV phụ trách.');
      router.refresh();
    } catch {
      setError('Không kết nối được máy chủ. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  if (options.length === 0) return <p className="muted">Chưa có THV nào để giao.</p>;
  if (caseTitle !== undefined) {
    return (
      <form className="panels assign-grid" onSubmit={submit} aria-labelledby="thv-t">
        <section className="panel form">
          <h2 id="thv-t">Phân công hồ sơ</h2>
          <label>
            Mã hồ sơ
            <input value={caseTitle} readOnly />
          </label>
          <label>
            THV
            <select name="thv" required defaultValue={currentThvId ?? options[0]?.userId}>
              {options.map((o) => (
                <option key={o.userId} value={o.userId}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Trạng thái
            <input value={currentThvId ? 'Đã phân công' : 'Chưa phân công'} readOnly />
          </label>
          {currentThvId ? (
            <label>
              Lý do đổi
              <input name="reason" required maxLength={2000} />
            </label>
          ) : null}
        </section>
        <aside className="panel">
          <h2>Kiểm tra trước khi phân công</h2>
          <p className="notice-blue">Trạng thái và quyền được xác minh khi thao tác thực tế.</p>
          <ul className="check-list">
            <li>Chỉ Admin được thực hiện</li>
            <li>Một THV phụ trách duy nhất</li>
            <li>THV chỉ xử lý hồ sơ được giao</li>
            <li>Thư ký vẫn truy cập mọi hồ sơ</li>
            <li>Lưu thời điểm và lịch sử phân công</li>
          </ul>
          <p role="alert" className="error" hidden={!error}>
            {error}
          </p>
          <p role="status" className="success" hidden={!notice}>
            {notice}
          </p>
          <button type="submit" className="primary wide" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Xác nhận phân công'}
          </button>
          <p className="note-box">
            Lưu audit • hiển thị thông báo và trạng thái kiểm tra sau thao tác.
          </p>
        </aside>
      </form>
    );
  }
  return (
    <form className="card form" onSubmit={submit} aria-labelledby="thv-t">
      <h2 id="thv-t">{currentThvId ? 'Đổi THV phụ trách' : 'Giao THV phụ trách'}</h2>
      <label>
        THV
        <select name="thv" required defaultValue={currentThvId ?? options[0]?.userId}>
          {options.map((o) => (
            <option key={o.userId} value={o.userId}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {currentThvId ? (
        <label>
          Lý do đổi
          <input name="reason" required maxLength={2000} />
        </label>
      ) : null}
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
      <p role="status" className="success" hidden={!notice}>
        {notice}
      </p>
      <button type="submit" className="primary" disabled={busy}>
        {busy ? 'Đang lưu…' : 'Lưu'}
      </button>
    </form>
  );
}
