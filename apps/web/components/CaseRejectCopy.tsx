'use client';

import { useState, type FormEvent } from 'react';
import { CheckPanel } from './CheckPanel';
import { useCaseApi } from './useCaseApi';

/** Tám trường hợp từ chối theo Điều 28, nhãn rút gọn. Số khoản gửi lên máy chủ; máy chủ là bên quyết định. */
export const REJECT_CLAUSES: readonly { readonly value: number; readonly label: string }[] = [
  { value: 1, label: 'Khoản 1: liên quan người thân' },
  { value: 2, label: 'Khoản 2: an ninh, bí mật nhà nước' },
  { value: 3, label: 'Khoản 3: đời tư, trái đạo đức' },
  { value: 4, label: 'Khoản 4: thuộc phạm vi công chứng, chứng thực, dịch, sao y' },
  { value: 5, label: 'Khoản 5: chuyển quyền đất, tài sản không giấy tờ' },
  { value: 6, label: 'Khoản 6: giao dịch trái pháp luật' },
  { value: 7, label: 'Khoản 7: công vụ quân đội, công an' },
  { value: 8, label: 'Khoản 8: trường hợp khác (bắt buộc nhập căn cứ)' },
];

function Feedback({ error, done, ok }: { error: string | null; done: boolean; ok: string }) {
  return (
    <>
      <p role="alert" className="error" hidden={!error}>
        {error}
      </p>
      <p role="status" className="success" hidden={!done}>
        {ok}
      </p>
    </>
  );
}

const text = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/** Từ chối yêu cầu lập Vi bằng (Điều 28) cho hồ sơ chưa ký. Quyền thật do máy chủ kiểm. */
export function RejectCaseForm({ caseId }: { readonly caseId: string }) {
  const api = useCaseApi(caseId);
  const [clause, setClause] = useState(1);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const basis = text(f, 'basis');
    void api.call('POST', 'rejection', {
      clause,
      ...(basis ? { basis } : {}),
      reason: text(f, 'reason'),
    });
  }
  return (
    <form className="card form" onSubmit={submit} aria-labelledby="reject-t">
      <h2 id="reject-t">Từ chối yêu cầu (Điều 28)</h2>
      <label>
        Trường hợp từ chối
        <select name="clause" value={clause} onChange={(e) => setClause(Number(e.target.value))}>
          {REJECT_CLAUSES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        {clause === 8 ? 'Căn cứ (bắt buộc với khoản 8)' : 'Căn cứ'}
        <input name="basis" maxLength={2000} required={clause === 8} />
      </label>
      <label>
        Lý do từ chối
        <textarea name="reason" required rows={2} maxLength={2000} />
      </label>
      <Feedback error={api.error} done={api.done} ok="Đã ghi nhận từ chối yêu cầu." />
      <button type="submit" disabled={api.busy} aria-busy={api.busy}>
        {api.busy ? 'Đang gửi…' : 'Từ chối yêu cầu'}
      </button>
    </form>
  );
}

/** Cấp bản sao Vi bằng (Điều 32) cho hồ sơ đã trả kết quả. Chi phí bản sao quản lý trên MISA, không nhập ở đây. */
export function IssueCopyForm({
  caseId,
  caseTitle,
}: {
  readonly caseId: string;
  /** Có tên hồ sơ thì dựng bố cục màn cấp bản sao (Figma 19:126); không có thì là biểu mẫu gọn. */
  readonly caseTitle?: string;
}) {
  const api = useCaseApi(caseId);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void api.call('POST', 'copies', {
      kind: text(f, 'kind'),
      requester: text(f, 'requester'),
      basis: text(f, 'basis'),
      copies: Number(text(f, 'copies')),
      receivedBy: text(f, 'receivedBy'),
    });
  }
  if (caseTitle !== undefined) {
    return (
      <form className="panels assign-grid" onSubmit={submit} aria-labelledby="copy-t">
        <section className="panel form">
          <h2 id="copy-t">Đăng ký yêu cầu cấp bản sao</h2>
          <label>
            Vi bằng gốc
            <input value={caseTitle} readOnly />
          </label>
          <label>
            Người yêu cầu thuộc nhóm
            <select name="kind" defaultValue="PARTICIPANT">
              <option value="PARTICIPANT">Người yêu cầu hoặc người tham gia</option>
              <option value="AUTHORITY">Cơ quan có thẩm quyền (yêu cầu bằng văn bản)</option>
            </select>
          </label>
          <label>
            Người hoặc cơ quan yêu cầu
            <input name="requester" required maxLength={500} />
          </label>
          <label>
            Căn cứ (vd đơn đề nghị, văn bản yêu cầu)
            <input name="basis" required maxLength={2000} />
          </label>
          <label>
            Số bản sao
            <input
              name="copies"
              type="number"
              required
              min={1}
              max={50}
              step={1}
              defaultValue={1}
            />
          </label>
          <label>
            Người nhận bản sao
            <input name="receivedBy" required maxLength={500} />
          </label>
        </section>
        <CheckPanel
          title="Kiểm soát cấp bản sao"
          checks={[
            'Đúng trường hợp được yêu cầu',
            'Đối chiếu bản gốc lưu trữ',
            'Theo thẩm quyền cơ quan lưu trữ',
            'Lưu lịch sử và người nhận',
            'Chi phí bản sao quản lý trên MISA',
          ]}
        >
          <Feedback error={api.error} done={api.done} ok="Đã ghi nhận cấp bản sao." />
          <button type="submit" className="primary wide" disabled={api.busy} aria-busy={api.busy}>
            {api.busy ? 'Đang gửi…' : 'Cấp bản sao'}
          </button>
        </CheckPanel>
      </form>
    );
  }
  return (
    <form className="card form" onSubmit={submit} aria-labelledby="copy-t">
      <h2 id="copy-t">Cấp bản sao vi bằng (Điều 32)</h2>
      <p className="muted">
        Hệ thống lưu thời điểm, người thực hiện và người nhận. Chi phí bản sao quản lý trên MISA.
      </p>
      <label>
        Người yêu cầu thuộc nhóm
        <select name="kind" defaultValue="PARTICIPANT">
          <option value="PARTICIPANT">Người yêu cầu hoặc người tham gia</option>
          <option value="AUTHORITY">Cơ quan có thẩm quyền (yêu cầu bằng văn bản)</option>
        </select>
      </label>
      <label>
        Người hoặc cơ quan yêu cầu
        <input name="requester" required maxLength={500} />
      </label>
      <label>
        Căn cứ (vd đơn đề nghị, văn bản yêu cầu)
        <input name="basis" required maxLength={2000} />
      </label>
      <label>
        Số bản sao
        <input name="copies" type="number" required min={1} max={50} step={1} defaultValue={1} />
      </label>
      <label>
        Người nhận bản sao
        <input name="receivedBy" required maxLength={500} />
      </label>
      <Feedback error={api.error} done={api.done} ok="Đã ghi nhận cấp bản sao." />
      <button type="submit" className="primary" disabled={api.busy} aria-busy={api.busy}>
        {api.busy ? 'Đang gửi…' : 'Cấp bản sao'}
      </button>
    </form>
  );
}
