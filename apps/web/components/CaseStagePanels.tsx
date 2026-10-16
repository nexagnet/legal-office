'use client';

import type { Progress } from './CaseSteps';
import { useCaseApi } from './useCaseApi';

interface Props {
  readonly caseId: string;
  readonly status: string;
  readonly progress: Progress;
  /** Vai của người dùng, chỉ để ẩn nút không liên quan; quyền thật do DB quyết định. */
  readonly roles: readonly string[];
}

const hasRole = (roles: readonly string[], ...r: string[]) => r.some((x) => roles.includes(x));
const isFinished = (status: string) => status === 'RETURNED' || status === 'CANCELLED';

function Pill({ tone, children }: { tone: 'ok' | 'warn' | 'idle'; children: string }) {
  return (
    <span className="pill" data-tone={tone}>
      {children}
    </span>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return (
    <p role="alert" className="error" hidden={!error}>
      {error}
    </p>
  );
}

/** Xác nhận MISA và cấp số (Figma 3:106). MISA là sổ duy nhất về tiền; hệ thống không quản lý số tiền. */
export function MisaNumberPanels({ caseId, status, progress, roles }: Props) {
  const api = useCaseApi(caseId);
  const misaOk = progress.misaStatus === 'CONFIRMED_FULL';
  const finished = isFinished(status);
  return (
    <>
      <div className="panels stage-grid">
        <section className="panel" aria-labelledby="misa-t">
          <h2 id="misa-t">Xác nhận thanh toán đủ</h2>
          <p>
            <Pill tone={misaOk ? 'ok' : 'warn'}>{misaOk ? 'Đã xác nhận đủ' : 'Chưa xác nhận'}</Pill>
          </p>
          <p className="muted">
            Thông tin kế toán do nhân viên đối chiếu trên MISA. Hệ thống KHÔNG quản lý số tiền, công
            nợ hay thu chi.
          </p>
          {!misaOk && !finished && hasRole(roles, 'KE_TOAN', 'ADMIN') ? (
            <form className="form" onSubmit={api.recordMisa}>
              <label>
                Mã tham chiếu MISA
                <input name="reference" required maxLength={200} />
              </label>
              <button type="submit" className="primary" disabled={api.busy}>
                Xác nhận đã thu đủ trên MISA
              </button>
            </form>
          ) : null}
          {!misaOk && !finished && !hasRole(roles, 'KE_TOAN', 'ADMIN') ? (
            <p className="muted">Kế toán xác nhận thanh toán trên MISA.</p>
          ) : null}
        </section>
        <section className="panel" aria-labelledby="number-t">
          <h2 id="number-t">Cấp số Vi bằng</h2>
          <p className="muted">Số chỉ được cấp sau khi xác nhận thanh toán đủ.</p>
          {progress.numberLabel ? (
            <p>
              <span className="muted">Số đã cấp: </span>
              <strong>{progress.numberLabel}</strong>
            </p>
          ) : null}
          {!progress.numberLabel &&
          misaOk &&
          !finished &&
          hasRole(roles, 'VAN_THU', 'THU_KY', 'ADMIN', 'TRUONG_VP') ? (
            <button
              type="button"
              className="primary"
              disabled={api.busy}
              onClick={() => void api.call('POST', 'number')}
            >
              Cấp số
            </button>
          ) : null}
          {!progress.numberLabel && !misaOk ? (
            <p className="muted">Cần xác nhận thanh toán đủ trước khi cấp số.</p>
          ) : null}
        </section>
      </div>
      <ErrorLine error={api.error} />
      <section className="panel notice" aria-labelledby="rule-t">
        <h2 id="rule-t">Nguyên tắc đánh số</h2>
        <p>
          Số được cấp duy nhất trên toàn Văn phòng theo năm; không tái sử dụng, kể cả khi hồ sơ hủy.
          Không có bước duyệt dự thảo riêng trên phần mềm.
        </p>
      </section>
    </>
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
      <div className="panels stage-cards">
        <section className="panel" aria-labelledby="sign-t">
          <p className="eyebrow">01 · Thừa hành viên</p>
          <h2 id="sign-t">Xác nhận đã ký</h2>
          {progress.numberLabel && !signed && !finished && hasRole(roles, 'THV') ? (
            <button
              type="button"
              className="primary"
              disabled={api.busy}
              onClick={() => void api.call('POST', 'signature-confirmations')}
            >
              Xác nhận đã ký
            </button>
          ) : null}
          {!progress.numberLabel ? <p className="muted">Cần cấp số trước khi ký.</p> : null}
          <Pill tone={signed ? 'ok' : 'warn'}>{signed ? 'Đã hoàn tất' : 'Chờ xác nhận ký'}</Pill>
        </section>
        <section className="panel" aria-labelledby="stamp-t">
          <p className="eyebrow">02 · Văn thư</p>
          <h2 id="stamp-t">Xác nhận đã đóng dấu</h2>
          {signed &&
          !stamped &&
          !finished &&
          hasRole(roles, 'VAN_THU', 'THU_KY', 'ADMIN', 'TRUONG_VP') ? (
            <button
              type="button"
              className="primary"
              disabled={api.busy}
              onClick={() => void api.call('POST', 'stamp-confirmations')}
            >
              Xác nhận đã đóng dấu
            </button>
          ) : null}
          {!signed ? (
            <p className="muted">Đóng dấu sau khi Thừa hành viên xác nhận đã ký.</p>
          ) : null}
          <Pill tone={stamped ? 'ok' : signed ? 'warn' : 'idle'}>
            {stamped ? 'Đã hoàn tất' : signed ? 'Chờ đóng dấu' : 'Chưa đến bước này'}
          </Pill>
        </section>
        <section className="panel" aria-labelledby="scan-t">
          <p className="eyebrow">03 · Hồ sơ scan cuối</p>
          <h2 id="scan-t">Tải bản scan đã ký &amp; đóng dấu</h2>
          {!progress.hasFinalScan && stamped && !finished && hasRole(roles, 'VAN_THU', 'THV') ? (
            <form className="form" onSubmit={api.uploadScan}>
              <label>
                Bản scan cuối (PDF, tối đa 25 MB)
                <input name="scan" type="file" accept="application/pdf" required />
              </label>
              <button type="submit" className="primary" disabled={api.busy}>
                Tải bản scan cuối
              </button>
            </form>
          ) : null}
          {!progress.hasFinalScan && !stamped ? (
            <p className="muted">Bản scan cuối tải lên được sau khi xác nhận đã đóng dấu.</p>
          ) : null}
          <Pill tone={progress.hasFinalScan ? 'ok' : stamped ? 'warn' : 'idle'}>
            {progress.hasFinalScan
              ? 'Đã hoàn tất'
              : stamped
                ? 'Chờ tải bản scan'
                : 'Chưa đến bước này'}
          </Pill>
        </section>
      </div>
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

/** Trả kết quả (Figma 3:158). Chỉ phần máy chủ đã hỗ trợ: xác nhận đã trả; chưa có nhật ký liên hệ/người nhận. */
export function ReturnPanel({ caseId, status, progress }: Omit<Props, 'roles'>) {
  const api = useCaseApi(caseId);
  const returned = status === 'RETURNED';
  const ready = !!progress.stampedAt && progress.hasFinalScan;
  const finished = isFinished(status);
  return (
    <>
      <section className="panel ready" data-ready={ready || returned} aria-labelledby="ready-t">
        <h2 id="ready-t">
          {returned
            ? 'ĐÃ TRẢ KẾT QUẢ'
            : ready
              ? 'ĐỦ ĐIỀU KIỆN TRẢ KẾT QUẢ'
              : 'CHƯA ĐỦ ĐIỀU KIỆN TRẢ KẾT QUẢ'}
        </h2>
        <p>
          {ready || returned
            ? 'Đã xác nhận ký, đóng dấu, tải và kiểm tra bản scan cuối. Không phụ thuộc trạng thái cập nhật với Sở.'
            : 'Cần xác nhận đã đóng dấu và tải bản scan cuối trước khi trả kết quả.'}
        </p>
      </section>
      {finished ? null : (
        <section className="panel" aria-labelledby="handover-t">
          <h2 id="handover-t">Bàn giao Vi bằng</h2>
          <p className="muted">Đã liên hệ không đồng nghĩa đã bàn giao.</p>
          {progress.stampedAt ? (
            <button
              type="button"
              className="primary"
              disabled={api.busy}
              onClick={() => void api.call('POST', 'return')}
            >
              Xác nhận đã trả kết quả
            </button>
          ) : null}
          <ErrorLine error={api.error} />
        </section>
      )}
    </>
  );
}
