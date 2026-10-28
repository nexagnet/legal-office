'use client';

import { PARTY_KIND_LABEL, PARTY_ROLE_LABEL, RESULT_KIND_LABEL } from '../lib/messages';
import { pickedFile, postFile } from '../lib/upload';
import { FormSheet, text } from './EnforcementAssets';
import { TerminationSheet } from './TerminationSheet';
import { Field, Input, Select } from './ui/field';

interface Obligation {
  readonly id: string;
  readonly seq: number;
  readonly description: string;
}
interface Props {
  readonly caseId: string;
  readonly status: string;
  readonly obligations: readonly Obligation[];
  /** Đương sự của hồ sơ, để gắn người có nghĩa vụ khi thêm nghĩa vụ. */
  readonly parties?: readonly { readonly id: string; readonly displayName: string }[];
}

async function post(path: string, body: unknown) {
  const res = await fetch(`/api/enforcement-cases/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { code?: string };
  return { ok: res.ok, code: json.code };
}

const ACCEPT = 'application/pdf,image/jpeg,image/png';

function ObligationSelect({
  id,
  obligations,
}: {
  readonly id: string;
  readonly obligations: readonly Obligation[];
}) {
  return (
    <Select id={id} name="obligationId" defaultValue={obligations[0]?.id}>
      {obligations.map((o) => (
        <option key={o.id} value={o.id}>
          {o.seq}. {o.description}
        </option>
      ))}
    </Select>
  );
}

/**
 * Các thao tác ghi của hồ sơ thi hành án (Figma H1): thêm đương sự, thêm nghĩa vụ, ghi diễn biến, ghi kết quả từng
 * phần kèm chứng cứ, hoàn tất hồ sơ, chấm dứt. Mỗi thao tác một ngăn kéo; quyền do máy chủ kiểm, lỗi hiện bằng tiếng Việt.
 * Mỗi lần ghi diễn biến hoặc kết quả mang khoá chống trùng riêng để bấm lại không tạo bản sao.
 */
export function EnforcementActions({ caseId, status, obligations, parties = [] }: Props) {
  if (status === 'COMPLETED') return <span className="muted">Đã hoàn tất</span>;
  if (status === 'TERMINATED') return <span className="muted">Đã chấm dứt</span>;
  const hasObligations = obligations.length > 0;

  return (
    <div className="flex flex-wrap gap-2">
      <FormSheet
        trigger="+ Thêm đương sự"
        title="Thêm đương sự"
        description="Người được thi hành, người phải thi hành, người có quyền lợi liên quan hoặc người đại diện."
        submitLabel="Thêm đương sự"
        variant="primary"
        onSubmit={(form) => {
          const displayName = text(form, 'displayName');
          if (!displayName) return Promise.resolve('Hãy nhập tên đương sự.');
          return post(`${caseId}/parties`, {
            displayName,
            kind: text(form, 'kind'),
            role: text(form, 'role'),
          });
        }}
      >
        <Field id="pt-name" label="Tên đương sự">
          <Input id="pt-name" name="displayName" maxLength={300} />
        </Field>
        <Field id="pt-kind" label="Loại">
          <Select id="pt-kind" name="kind" defaultValue="PERSON">
            {Object.entries(PARTY_KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="pt-role" label="Vai trò">
          <Select id="pt-role" name="role" defaultValue="DEBTOR">
            {Object.entries(PARTY_ROLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
      </FormSheet>
      <FormSheet
        trigger="+ Thêm nghĩa vụ"
        title="Thêm nghĩa vụ"
        description="Nội dung nghĩa vụ theo bản án hoặc thỏa thuận. Số tiền chỉ là nội dung, không phải sổ thu chi."
        submitLabel="Thêm nghĩa vụ"
        variant="secondary"
        onSubmit={(form) => {
          const description = text(form, 'description');
          if (!description) return Promise.resolve('Hãy nhập nội dung nghĩa vụ.');
          const obligor = text(form, 'obligorPartyId');
          const due = text(form, 'dueOn');
          return post(`${caseId}/obligations`, {
            description,
            ...(obligor ? { obligorPartyId: obligor } : {}),
            ...(due ? { dueOn: due } : {}),
          });
        }}
      >
        <Field id="ob-desc" label="Nghĩa vụ">
          <Input id="ob-desc" name="description" maxLength={2000} />
        </Field>
        {parties.length > 0 ? (
          <Field id="ob-party" label="Người có nghĩa vụ (không bắt buộc)">
            <Select id="ob-party" name="obligorPartyId" defaultValue="">
              <option value="">Chưa gắn đương sự</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field id="ob-due" label="Hạn thực hiện (không bắt buộc)">
          <Input id="ob-due" name="dueOn" type="date" />
        </Field>
      </FormSheet>
      {hasObligations ? (
        <FormSheet
          trigger="Ghi diễn biến"
          title="Ghi diễn biến của nghĩa vụ"
          description="Ghi chú không cần chứng cứ; kết quả một phần hay hoàn tất thì ghi ở nút Ghi kết quả."
          submitLabel="Ghi chú"
          variant="secondary"
          onSubmit={(form) => {
            const note = text(form, 'note');
            if (!note) return Promise.resolve('Hãy ghi nội dung diễn biến.');
            return post(`obligations/${text(form, 'obligationId')}/events`, {
              kind: 'NOTE',
              note,
              idempotencyKey: crypto.randomUUID(),
            });
          }}
        >
          <Field id="nt-ob" label="Nghĩa vụ cần ghi chú">
            <ObligationSelect id="nt-ob" obligations={obligations} />
          </Field>
          <Field id="nt-note" label="Ghi chú diễn biến">
            <Input id="nt-note" name="note" maxLength={4000} />
          </Field>
        </FormSheet>
      ) : null}
      {hasObligations ? (
        <FormSheet
          trigger="Ghi kết quả"
          title="Ghi kết quả từng phần"
          description="Kết quả ghi rồi bất biến, không sửa. Hoàn thành một nghĩa vụ không làm xong cả vụ."
          submitLabel="Ghi kết quả kèm chứng cứ"
          variant="secondary"
          onSubmit={(form) => {
            const note = text(form, 'note');
            const file = pickedFile(form, 'file');
            if (!note) return Promise.resolve('Hãy ghi nội dung kết quả.');
            if (!file) return Promise.resolve('Hãy chọn tệp chứng cứ.');
            return postFile(
              `enforcement-cases/obligations/${text(form, 'obligationId')}/event-files`,
              file,
              {
                kind: text(form, 'kind'),
                note,
                idempotencyKey: crypto.randomUUID(),
              },
            );
          }}
        >
          <Field id="rs-ob" label="Nghĩa vụ có kết quả">
            <ObligationSelect id="rs-ob" obligations={obligations} />
          </Field>
          <Field id="rs-kind" label="Loại kết quả">
            <Select id="rs-kind" name="kind" defaultValue="PARTIAL_RESULT">
              {Object.entries(RESULT_KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="rs-note" label="Nội dung kết quả">
            <Input id="rs-note" name="note" maxLength={4000} />
          </Field>
          <Field id="rs-file" label="Tệp chứng cứ (PDF, JPEG, PNG; tối đa 25 MB)">
            <Input id="rs-file" name="file" type="file" accept={ACCEPT} />
          </Field>
        </FormSheet>
      ) : null}
      <FormSheet
        trigger="Hoàn tất hồ sơ"
        title="Hoàn tất hồ sơ thi hành án"
        description="Chỉ hoàn tất khi mọi nghĩa vụ đã hoàn thành. Chỉ Admin hoặc Trưởng văn phòng ghi."
        submitLabel="Hoàn tất hồ sơ"
        variant="secondary"
        onSubmit={(form) => {
          const file = pickedFile(form, 'completion');
          if (!file) return Promise.resolve('Hãy chọn tệp chứng cứ hoàn tất.');
          return postFile(`enforcement-cases/${caseId}/completion-file`, file);
        }}
      >
        <Field id="cp-file" label="Tệp chứng cứ hoàn tất hồ sơ (PDF, JPEG, PNG; tối đa 25 MB)">
          <Input id="cp-file" name="completion" type="file" accept={ACCEPT} />
        </Field>
      </FormSheet>
      <TerminationSheet caseId={caseId} />
    </div>
  );
}
