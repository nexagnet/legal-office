import type { ReactNode } from 'react';
import { ConditionList, type Condition } from '../../../components/ui/condition-list';
import { AssignThv, type ThvOption } from '../../../components/AssignThv';
import { CaseActions } from '../../../components/CaseActions';
import { CHANGE_FIELD_LABEL } from '../../../lib/change-fields';
import { IssueCopyForm, RejectCaseForm } from '../../../components/CaseRejectCopy';
import {
  MisaNumberPanels,
  ReturnPanel,
  SignStampPanels,
  type NumberPreview,
} from '../../../components/CaseStagePanels';
import { ChangeDecision } from '../../../components/ChangeRequestRow';
import { MisaRevoke, type RevokeProposal } from '../../../components/MisaRevoke';
import { N11Correction, type N11Item } from '../../../components/N11Correction';
import { RegistrationForm } from '../../../components/RegistrationForm';
import { type Progress } from '../../../components/CaseSteps';
import { getJson } from '../../../lib/case-api';
import {
  CONTACT_KIND_LABEL,
  CONTACT_OUTCOME_LABEL,
  type ContactEntry,
} from '../../../lib/contacts';
import type { Registration } from '../../../lib/registration';
import type { CaseContext } from './case-frame';

export interface StageCtx extends CaseContext {
  readonly progress: Progress;
}
export interface StageDef {
  readonly title: string;
  /** Thao tác hiếm: hộp thoại giữa màn hình (E7). Thao tác theo giai đoạn: ngăn kéo bên phải (E8). */
  readonly variant: 'modal' | 'sheet';
  readonly body: (ctx: StageCtx) => ReactNode | Promise<ReactNode>;
}

const MISA_LABEL: Record<string, string> = {
  CONFIRMED_FULL: 'Đã xác nhận thanh toán đủ',
  NOT_CONFIRMED: 'Chưa xác nhận',
  REVOKED: 'Đã thu hồi xác nhận',
};
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : null);
const fmtDay = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('vi-VN') : null;
const enc = (id: string) => encodeURIComponent(id);

/** Hộp thoại thao tác theo Figma N18: danh sách điều kiện, biểu mẫu, ghi chú. Quyền và điều kiện thật vẫn do máy chủ kiểm. */
function Conditioned({
  label,
  conditions,
  notice,
  tone = 'blue',
  children,
}: {
  readonly label: string;
  readonly conditions: readonly Condition[];
  readonly notice?: string;
  readonly tone?: 'blue' | 'amber' | 'red';
  readonly children: ReactNode;
}) {
  const toneClass = {
    blue: 'bg-accent-soft text-accent',
    amber: 'notice-amber',
    red: 'bg-danger-soft text-danger',
  }[tone];
  return (
    <div className="grid gap-5">
      <ConditionList conditions={conditions} label={label} />
      {children}
      {notice ? (
        <p className={`m-0 rounded-xl px-4 py-3 text-[14px] ${toneClass}`}>{notice}</p>
      ) : null}
    </div>
  );
}

const loadError = (what: string) => (
  <div className="state" role="alert">
    <h2>Không tải được {what}</h2>
    <p>Vui lòng thử lại sau.</p>
  </div>
);

interface ChangeRow {
  readonly id: string;
  readonly reason: string;
  readonly before: Record<string, string>;
  readonly after: Record<string, string>;
  readonly status: string;
}

export const STAGES: Readonly<Record<string, StageDef>> = {
  'cap-so': {
    title: 'Xác nhận MISA và cấp số',
    variant: 'sheet',
    body: async ({ c, progress, roles, cookie }) => {
      const [misa, preview] = await Promise.all([
        getJson<{ reference: string | null }>(`/vibang/cases/${enc(c.id)}/misa`, cookie),
        getJson<NumberPreview>(`/vibang/cases/${enc(c.id)}/number-preview`, cookie),
      ]);
      return (
        <MisaNumberPanels
          caseId={c.id}
          status={c.status}
          progress={progress}
          roles={roles}
          thvLabel={c.thvLabel ?? (c.responsibleThvUserId ? 'Đã phân công' : null)}
          misaReference={typeof misa === 'object' ? misa.reference : null}
          preview={typeof preview === 'object' ? preview : null}
        />
      );
    },
  },
  'ky-dong-dau': {
    title: 'Ký, đóng dấu và bản scan',
    variant: 'sheet',
    body: ({ c, progress, roles }) => (
      <SignStampPanels caseId={c.id} status={c.status} progress={progress} roles={roles} />
    ),
  },
  'tra-ket-qua': {
    title: 'Trả kết quả và liên hệ khách',
    variant: 'sheet',
    body: async ({ c, progress, roles, cookie }) => {
      const res = await getJson<{ items: ContactEntry[] }>(
        `/vibang/cases/${enc(c.id)}/contacts`,
        cookie,
      );
      return (
        <ReturnPanel
          caseId={c.id}
          status={c.status}
          progress={progress}
          roles={roles}
          contacts={typeof res === 'object' ? res.items : []}
          handover={{ recipient: c.handoverRecipient ?? null, on: c.handoverOn ?? null }}
        />
      );
    },
  },
  'kiem-tra-ban-giao': {
    title: 'Kiểm tra bàn giao',
    variant: 'sheet',
    body: async ({ c, progress: p, base, cookie }) => {
      const res = await getJson<{ items: ContactEntry[] }>(
        `/vibang/cases/${enc(c.id)}/contacts`,
        cookie,
      );
      const last = typeof res === 'object' ? res.items[res.items.length - 1] : undefined;
      const contact = last
        ? `${CONTACT_KIND_LABEL[last.kind] ?? last.kind}, ${fmt(last.at)} · ${CONTACT_OUTCOME_LABEL[last.outcome] ?? last.outcome}`
        : 'Chưa có liên hệ khách';
      const received = c.handoverRecipient
        ? `${c.handoverRecipient} · ${fmtDay(c.handoverOn) ?? ''}`.replace(/ · $/, '')
        : 'Chưa ghi nhận người nhận';
      const rows: [string, string][] = [
        ['Vi bằng', p.numberLabel ?? c.title],
        ['THV đã ký', p.signedAt ? `Đã xác nhận ${fmt(p.signedAt)}` : 'Chưa xác nhận'],
        ['Văn thư đã đóng dấu', p.stampedAt ? `Đã xác nhận ${fmt(p.stampedAt)}` : 'Chưa xác nhận'],
        ['Bản scan đã ký và dấu', p.hasFinalScan ? 'Đã tải lên, đã khoá' : 'Chưa có bản scan cuối'],
        ['Liên hệ khách', contact],
        ['Người nhận, ngày nhận', received],
      ];
      if (p.misaRevokeStatus !== 'NONE') rows.push(['Chặn', 'Đang có đề nghị thu hồi MISA']);
      return (
        <div className="grid gap-4">
          <dl className="info">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <a className="primary btn-link wide" href={`${base}/tra-ket-qua`}>
            Xác nhận đã trả kết quả
          </a>
        </div>
      );
    },
  },
  'thu-hoi-misa': {
    title: 'Thu hồi số MISA',
    variant: 'modal',
    body: async ({ c, progress, roles, cookie }) => {
      const m = await getJson<{
        status: string;
        reference: string | null;
        confirmedAt: string | null;
        revokeProposals: readonly RevokeProposal[];
      }>(`/vibang/cases/${enc(c.id)}/misa`, cookie);
      if (typeof m !== 'object') return loadError('trạng thái MISA');
      return (
        <MisaRevoke
          caseId={c.id}
          caseTitle={c.title}
          numberLabel={progress.numberLabel}
          misaStatusLabel={MISA_LABEL[m.status] ?? m.status}
          reference={m.reference}
          confirmedAt={m.confirmedAt}
          proposals={m.revokeProposals}
          canPropose={roles.includes('KE_TOAN') || roles.includes('ADMIN')}
          canDecide={roles.includes('ADMIN')}
        />
      );
    },
  },
  'sua-loi-n11': {
    title: 'Sửa lỗi kỹ thuật (N-11)',
    variant: 'modal',
    body: async ({ c, progress, cookie }) => {
      const base = `/vibang/cases/${enc(c.id)}`;
      const [n11, docs] = await Promise.all([
        getJson<{ items: N11Item[] }>(`${base}/n11-corrections`, cookie),
        getJson<{ items: { id: string; kind: string; version: number; createdAt: string }[] }>(
          `${base}/documents`,
          cookie,
        ),
      ]);
      if (typeof n11 !== 'object') return loadError('đề nghị sửa lỗi');
      const documents =
        typeof docs === 'object'
          ? docs.items.map((d) => ({
              id: d.id,
              label: `${d.kind} · bản ${d.version} · ${new Date(d.createdAt).toLocaleDateString('vi-VN')}`,
            }))
          : [];
      return (
        <N11Correction
          caseId={c.id}
          caseTitle={c.title}
          numberLabel={progress.numberLabel}
          createdAt={c.createdAt}
          items={n11.items}
          documents={documents}
        />
      );
    },
  },
  'cap-ban-sao': {
    title: 'Cấp bản sao Vi bằng',
    variant: 'modal',
    body: ({ c, progress }) => (
      <Conditioned
        label="Điều kiện cấp bản sao"
        conditions={[
          {
            key: 'returned',
            title: 'Hồ sơ đã trả kết quả',
            hint:
              c.status === 'RETURNED'
                ? 'Đủ điều kiện cấp bản sao'
                : 'Điều 32: chỉ cấp cho hồ sơ đã trả',
            met: c.status === 'RETURNED',
          },
        ]}
        notice="Chi phí bản sao quản lý trên MISA, không nhập ở đây."
      >
        {c.status === 'RETURNED' ? (
          <IssueCopyForm caseId={c.id} caseTitle={progress.numberLabel ?? c.title} />
        ) : null}
      </Conditioned>
    ),
  },
  'phan-cong': {
    title: 'Phân công thừa phát lại',
    variant: 'modal',
    body: async ({ c, roles, cookie }) => {
      const isAdmin = roles.includes('ADMIN');
      const unsigned = c.status === 'INTAKE' || c.status === 'ASSIGNED';
      const thv = isAdmin ? await getJson<{ items: ThvOption[] }>('/vibang/thv', cookie) : null;
      return (
        <Conditioned
          label="Điều kiện phân công"
          conditions={[
            {
              key: 'unsigned',
              title: 'Hồ sơ chưa ký',
              hint: 'Đã phân công thì vẫn đổi được cho tới khi ký',
              met: unsigned,
            },
            {
              key: 'admin',
              title: 'Bạn là Admin',
              hint: 'Mỗi Vi bằng có một Thừa hành viên phụ trách do Admin giao',
              met: isAdmin,
            },
          ]}
          notice="Thừa hành viên nhận việc ở Việc của tôi. Lịch sử hồ sơ ghi người phân công và thời điểm."
        >
          {isAdmin ? (
            <AssignThv
              caseId={c.id}
              caseTitle={c.title}
              options={thv && typeof thv === 'object' ? thv.items : []}
              currentThvId={c.responsibleThvUserId}
            />
          ) : null}
        </Conditioned>
      );
    },
  },
  'cap-nhat-so': {
    title: 'Cập nhật Sở Tư pháp',
    variant: 'modal',
    body: async ({ c, cookie }) => {
      const r = await getJson<Registration>(`/vibang/cases/${enc(c.id)}/registration`, cookie);
      const has = typeof r === 'object';
      return (
        <Conditioned
          label="Điều kiện cập nhật Sở"
          conditions={[
            {
              key: 'number',
              title: 'Hồ sơ đã có số',
              hint: has
                ? r.numberLabel
                : 'Chỉ Vi bằng đã cấp số mới có mục theo dõi cập nhật CSDL / Sở',
              met: has,
            },
          ]}
          tone="amber"
          notice="Hạn 3 ngày làm việc. Chưa cập nhật không chặn trả kết quả; sự cố được ghi nhận vào nhật ký và hiện ở Thông báo."
        >
          {has ? (
            <RegistrationForm
              caseId={c.id}
              numberLabel={r.numberLabel}
              madeAt={r.madeAt}
              regStatus={r.regStatus}
              deadlineAt={r.deadlineAt}
            />
          ) : null}
        </Conditioned>
      );
    },
  },
  'duyet-sua': {
    title: 'Duyệt đề nghị sửa hồ sơ',
    variant: 'modal',
    body: ({ c, roles, changes }) => {
      const pending = (changes as readonly ChangeRow[]).filter((r) => r.status === 'PENDING');
      if (pending.length === 0) {
        return (
          <div className="state" role="status">
            <h2>Không có yêu cầu chờ duyệt</h2>
            <p>Hồ sơ này chưa có đề nghị sửa nào đang chờ Admin.</p>
          </div>
        );
      }
      return (
        <div className="grid gap-5">
          {pending.map((r) => {
            const field = Object.keys(r.after)[0] ?? '';
            return (
              <section key={r.id} className="grid gap-3" aria-label="Yêu cầu chờ duyệt">
                <dl className="info">
                  <dt>Hồ sơ</dt>
                  <dd>{c.title}</dd>
                  <dt>Trường dữ liệu</dt>
                  <dd>{CHANGE_FIELD_LABEL[field] ?? field}</dd>
                  <dt>Giá trị cũ</dt>
                  <dd>{r.before[field] ?? ''}</dd>
                  <dt>Giá trị mới</dt>
                  <dd>{r.after[field] ?? ''}</dd>
                  <dt>Lý do</dt>
                  <dd>{r.reason}</dd>
                </dl>
                <ChangeDecision requestId={r.id} canDecide={roles.includes('ADMIN')} wide />
              </section>
            );
          })}
        </div>
      );
    },
  },
  'huy-ho-so': {
    title: 'Huỷ hồ sơ',
    variant: 'modal',
    body: ({ c, isAdmin, isFinal, windowOpen }) => (
      <Conditioned
        label="Điều kiện huỷ hồ sơ"
        conditions={[
          {
            key: 'open',
            title: 'Hồ sơ chưa trả kết quả',
            hint: isFinal ? 'Hồ sơ đã kết thúc' : 'Chưa kết thúc',
            met: !isFinal,
          },
          {
            key: 'admin',
            title: 'Bạn là Admin',
            hint: 'Chỉ Admin huỷ hồ sơ chưa kết thúc',
            met: isAdmin,
          },
        ]}
        tone="red"
        notice="Huỷ không hoàn tác. Số đã cấp (nếu có) không được dùng lại và hồ sơ vẫn nằm trong sổ; lý do và người huỷ được ghi nhật ký."
      >
        {isAdmin && !isFinal ? (
          <CaseActions
            caseId={c.id}
            title={c.title}
            description={c.description ?? ''}
            windowOpen={windowOpen}
            isFinal={isFinal}
            canCancel
            section="cancel"
          />
        ) : null}
      </Conditioned>
    ),
  },
  'tu-choi': {
    title: 'Từ chối yêu cầu',
    variant: 'modal',
    body: ({ c }) =>
      c.status === 'INTAKE' || c.status === 'ASSIGNED' ? (
        <RejectCaseForm caseId={c.id} />
      ) : (
        <div className="state" role="status">
          <h2>Không từ chối được</h2>
          <p>Chỉ từ chối yêu cầu khi hồ sơ chưa được ký.</p>
        </div>
      ),
  },
};
