'use client';

import type { ContactEntry } from '../lib/contacts';
import { HandoverForm } from './HandoverForm';
import { ContactLog } from './ContactLog';
import type { Progress } from './CaseSteps';
import { useCaseApi } from './useCaseApi';
import { ConditionList, type Condition } from './ui/condition-list';
import { StepCards } from './ui/step-cards';

interface Props {
  readonly caseId: string;
  readonly status: string;
  readonly progress: Progress;
  /** Vai của người dùng, chỉ để ẩn nút không liên quan; quyền thật do DB quyết định. */
  readonly roles: readonly string[];
}

const hasRole = (roles: readonly string[], ...r: string[]) => r.some((x) => roles.includes(x));
const isFinished = (status: string) => status === 'RETURNED' || status === 'CANCELLED';

function ErrorLine({ error }: { error: string | null }) {
  return (
    <p role="alert" className="error" hidden={!error}>
      {error}
    </p>
  );
}

export interface NumberPreview {
  readonly nextLabel: string;
  readonly paperLastImported: boolean;
}

/**
 * Xác nhận MISA và cấp số (Figma V2): danh sách điều kiện, khung "Số sẽ cấp", nút Cấp số khoá đến khi đủ điều kiện.
 * MISA là sổ duy nhất về tiền; hệ thống không quản lý số tiền. Quyền thật do DB quyết định.
 */
export function MisaNumberPanels({
  caseId,
  status,
  progress,
  roles,
  thvLabel,
  misaReference,
  preview,
}: Props & {
  readonly thvLabel: string | null;
  readonly misaReference: string | null;
  readonly preview: NumberPreview | null;
}) {
  const api = useCaseApi(caseId);
  const misaOk = progress.misaStatus === 'CONFIRMED_FULL';
  const finished = isFinished(status);
  const issued = !!progress.numberLabel;
  const canIssue =
    misaOk && !issued && !finished && hasRole(roles, 'VAN_THU', 'THU_KY', 'ADMIN', 'TRUONG_VP');
  const conditions: Condition[] = [
    {
      key: 'thv',
      title: 'Có THV phụ trách',
      hint: thvLabel ?? 'Chưa phân công',
      met: !!thvLabel,
    },
    {
      key: 'misa',
      title: 'Kế toán đã xác nhận thanh toán đủ',
      hint: misaOk ? `Tham chiếu MISA ${misaReference ?? ''}`.trim() : 'Chưa xác nhận',
      met: misaOk,
    },
    {
      key: 'free',
      title: 'Hồ sơ chưa có số',
      hint: issued ? `Đã cấp ${progress.numberLabel}` : 'Không dùng lại số của hồ sơ huỷ',
      met: !issued,
    },
  ];
  return (
    <div className="grid gap-5">
      <ConditionList conditions={conditions} label="Điều kiện cấp số" />
      {!misaOk && !finished && hasRole(roles, 'KE_TOAN', 'ADMIN') ? (
        <form className="form" onSubmit={api.recordMisa}>
          <label>
            Mã tham chiếu MISA
            <input name="reference" required maxLength={200} />
          </label>
          <button type="submit" className="primary" disabled={api.busy} aria-busy={api.busy}>
            Xác nhận đã thu đủ trên MISA
          </button>
          <p className="muted">
            Hệ thống KHÔNG quản lý số tiền, công nợ hay thu chi; chỉ ghi tham chiếu do kế toán đối
            chiếu trên MISA.
          </p>
        </form>
      ) : null}
      {issued || preview ? (
        <div className="grid gap-1 rounded-xl bg-accent-soft px-5 py-4">
          <span className="text-[13px] text-muted">{issued ? 'Số đã cấp' : 'Số sẽ cấp'}</span>
          <strong className="font-serif text-[28px] leading-9 text-accent">
            {progress.numberLabel ?? preview?.nextLabel}
          </strong>
          <span className="text-[13px] text-muted">
            Một dãy toàn Văn phòng, tăng dần trong năm. Số thật do máy chủ cấp khi bấm Cấp số.
          </span>
        </div>
      ) : null}
      {!issued && preview && !preview.paperLastImported ? (
        <p role="note" className="m-0 text-[13px] text-danger">
          Chưa nhập số cuối của sổ giấy thì không cấp được số thật. Admin nhập ở Cấu hình hệ thống.
        </p>
      ) : null}
      <ErrorLine error={api.error} />
      <button
        type="button"
        className="primary"
        disabled={!canIssue || api.busy}
        aria-busy={api.busy}
        onClick={() => void api.call('POST', 'number')}
      >
        Cấp số
      </button>
      {!issued && !canIssue && !finished && misaOk ? (
        <p className="muted">Văn thư hoặc Thư ký cấp số.</p>
      ) : null}
    </div>
  );
}

/** Ký, đóng dấu và bản scan (Figma 3:132). */
export function SignStampPanels({ caseId, status, progress, roles }: Props) {
  const api = useCaseApi(caseId);
  const finished = isFinished(status);
  const signed = !!progress.signedAt;
  const stamped = !!progress.stampedAt;
  return (
    <>
      <StepCards
        label="Ba bước ký, đóng dấu và bản scan"
        steps={[
          {
            key: 'sign',
            role: 'Thừa hành viên',
            title: 'Xác nhận đã ký',
            state: signed ? 'done' : progress.numberLabel ? 'current' : 'todo',
            description: signed
              ? 'Đã ký.'
              : progress.numberLabel
                ? 'Thừa hành viên xác nhận đã ký bản giấy.'
                : 'Cần cấp số trước khi ký.',
            action:
              progress.numberLabel && !signed && !finished && hasRole(roles, 'THV') ? (
                <button
                  type="button"
                  className="primary"
                  disabled={api.busy}
                  aria-busy={api.busy}
                  onClick={() => void api.call('POST', 'signature-confirmations')}
                >
                  Xác nhận đã ký
                </button>
              ) : undefined,
          },
          {
            key: 'stamp',
            role: 'Văn thư',
            title: 'Xác nhận đã đóng dấu',
            state: stamped ? 'done' : signed ? 'current' : 'todo',
            description: stamped
              ? 'Đã đóng dấu.'
              : signed
                ? 'Đóng dấu lên bản giấy, rồi xác nhận tại đây.'
                : 'Đóng dấu sau khi Thừa hành viên xác nhận đã ký.',
            action:
              signed &&
              !stamped &&
              !finished &&
              hasRole(roles, 'VAN_THU', 'THU_KY', 'ADMIN', 'TRUONG_VP') ? (
                <button
                  type="button"
                  className="primary"
                  disabled={api.busy}
                  aria-busy={api.busy}
                  onClick={() => void api.call('POST', 'stamp-confirmations')}
                >
                  Xác nhận đã đóng dấu
                </button>
              ) : undefined,
          },
          {
            key: 'scan',
            role: 'Hồ sơ scan cuối',
            title: 'Tải bản scan đã ký & đóng dấu',
            state: progress.hasFinalScan ? 'done' : stamped ? 'current' : 'todo',
            description: progress.hasFinalScan
              ? 'Đã tải bản scan cuối.'
              : stamped
                ? 'Tải bản scan PDF đầy đủ các trang.'
                : 'Bản scan cuối tải lên được sau khi xác nhận đã đóng dấu.',
            action:
              !progress.hasFinalScan && stamped && !finished && hasRole(roles, 'VAN_THU', 'THV') ? (
                <form className="form" onSubmit={api.uploadScan}>
                  <label>
                    Bản scan cuối (PDF, tối đa 25 MB)
                    <input name="scan" type="file" accept="application/pdf" required />
                  </label>
                  <button
                    type="submit"
                    className="primary"
                    disabled={api.busy}
                    aria-busy={api.busy}
                  >
                    Tải bản scan cuối
                  </button>
                </form>
              ) : undefined,
          },
        ]}
      />
      <ErrorLine error={api.error} />
      <section className="panel" aria-labelledby="issued-t">
        <h2 id="issued-t">Tài liệu phát hành</h2>
        <p className="muted">
          Bản gốc giấy được lưu tại Văn phòng. Bản scan trên Cloud chỉ phục vụ quản lý; chưa triển
          khai ký số pháp lý.
        </p>
        <p className="small">
          Kiểm tra bổ sung: chữ ký/điểm chỉ của người yêu cầu; ảnh Thừa hành viên trực tiếp chứng
          kiến; số trang, giáp lai nếu áp dụng.
        </p>
      </section>
    </>
  );
}

/**
 * Trả kết quả (Figma V3): năm điều kiện, nhật ký liên hệ và ô người nhận, nút Ghi đã trả khoá đến khi đủ điều kiện.
 * Liên hệ khách chưa phải là đã trả; phải có bàn giao thực tế. Máy chủ vẫn kiểm lại từng điều kiện.
 */
export function ReturnPanel({
  caseId,
  status,
  progress,
  roles,
  contacts,
  handover,
}: Props & {
  readonly contacts: readonly ContactEntry[];
  readonly handover: { readonly recipient: string | null; readonly on: string | null };
}) {
  const api = useCaseApi(caseId);
  const returned = status === 'RETURNED';
  const finished = isFinished(status);
  const conditions: Condition[] = [
    {
      key: 'misa',
      title: 'Xác nhận thanh toán còn hợp lệ',
      met: progress.misaStatus === 'CONFIRMED_FULL' && progress.misaRevokeStatus === 'NONE',
    },
    { key: 'signed', title: 'Thừa hành viên đã ký', met: !!progress.signedAt },
    { key: 'stamped', title: 'Văn thư đã đóng dấu', met: !!progress.stampedAt },
    { key: 'scan', title: 'Bản scan cuối đủ chữ ký và dấu', met: progress.hasFinalScan },
    { key: 'handover', title: 'Bàn giao thực tế đã xảy ra', met: !!handover.recipient },
  ];
  const missing = conditions.findIndex((c) => !c.met);
  const ready = missing === -1;
  return (
    <div className="grid gap-5">
      <ConditionList conditions={conditions} label="Điều kiện trả kết quả" />
      {returned ? <p className="m-0 font-semibold text-ok">Đã trả kết quả.</p> : null}
      {finished && !returned ? null : (
        <div className="grid gap-3">
          <p className="muted m-0">Đã liên hệ không đồng nghĩa đã bàn giao.</p>
          {progress.stampedAt ? (
            <HandoverForm
              caseId={caseId}
              recipient={handover.recipient}
              handedOverOn={handover.on}
              canRecord={hasRole(roles, 'ADMIN', 'THV', 'VAN_THU')}
            />
          ) : null}
        </div>
      )}
      <ContactLog
        caseId={caseId}
        contacts={contacts}
        canLog={!finished && hasRole(roles, 'ADMIN', 'THV', 'THU_KY', 'VAN_THU')}
      />
      {!returned && !finished && !ready ? (
        <p
          role="alert"
          className="m-0 rounded-lg bg-danger-soft px-4 py-3 text-[14px] font-semibold text-danger"
        >
          Thiếu điều kiện {missing + 1}: {conditions[missing]?.title.toLowerCase()}.
        </p>
      ) : null}
      <ErrorLine error={api.error} />
      {returned || finished ? null : (
        <button
          type="button"
          className="primary"
          disabled={!ready || api.busy}
          aria-busy={api.busy}
          onClick={() => void api.call('POST', 'return')}
        >
          Ghi đã trả
        </button>
      )}
    </div>
  );
}
