'use client';

import { useState, type FormEvent } from 'react';
import { CheckPanel } from './CheckPanel';
import { useCaseApi } from './useCaseApi';

/** Tám trường hợp từ chối theo Điều 28 (nhãn theo Figma V4). Số khoản gửi lên máy chủ; máy chủ là bên quyết định. */
export const REJECT_CLAUSES: readonly { readonly value: number; readonly label: string }[] = [
  { value: 1, label: 'Liên quan đến người thân theo quy định' },
  { value: 2, label: 'An ninh, bí mật nhà nước' },
  { value: 3, label: 'Đời tư, trái đạo đức xã hội' },
  { value: 4, label: 'Thuộc phạm vi công chứng, chứng thực, dịch, sao y' },
  { value: 5, label: 'Chuyển quyền đất, tài sản không có giấy tờ hợp pháp' },
  { value: 6, label: 'Giao dịch trái pháp luật' },
  { value: 7, label: 'Công vụ của quân đội, công an' },
  { value: 8, label: 'Căn cứ khác có cơ sở' },
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

/**
 * Từ chối yêu cầu lập Vi bằng (Điều 28, Figma V4) cho hồ sơ chưa ký: chọn một trong tám căn cứ, ghi lý do cụ thể.
 * Quyền và điều kiện thật do máy chủ kiểm; nút xác nhận màu đỏ vì sau khi từ chối hồ sơ đóng ở trạng thái Từ chối.
 */
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
    <form className="grid gap-4" onSubmit={submit} aria-label="Từ chối yêu cầu (Điều 28)">
      <p className="muted m-0">
        Chọn căn cứ theo Điều 28 NĐ 151 và ghi lý do. Không từ chối được hồ sơ đã có số.
      </p>
      <fieldset className="m-0 grid gap-0.5 border-0 p-0">
        <legend className="sr-only">Trường hợp từ chối</legend>
        {REJECT_CLAUSES.map((c) => (
          <label
            key={c.value}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1 text-[15px]"
          >
            <input
              type="radio"
              name="clause"
              value={c.value}
              checked={clause === c.value}
              onChange={() => setClause(c.value)}
              className="size-5 accent-[var(--accent)]"
            />
            <span className={clause === c.value ? 'font-semibold' : undefined}>{c.label}</span>
          </label>
        ))}
      </fieldset>
      <label>
        {clause === 8 ? 'Căn cứ (bắt buộc với căn cứ khác)' : 'Căn cứ'}
        <input name="basis" maxLength={2000} required={clause === 8} />
      </label>
      <label>
        Lý do từ chối
        <textarea name="reason" required rows={2} maxLength={2000} />
      </label>
      <p className="notice-amber m-0">
        Mã khoản, lý do và người ghi được lưu vào nhật ký. Sau khi từ chối, hồ sơ đóng ở trạng thái
        Từ chối.
      </p>
      <Feedback error={api.error} done={api.done} ok="Đã ghi nhận từ chối yêu cầu." />
      <button type="submit" className="danger-outline" disabled={api.busy} aria-busy={api.busy}>
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
