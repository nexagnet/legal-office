'use client';

import type { Branch } from '../app/session';
import { messageFor } from '../lib/messages';
import { WizardSheet } from './ui/wizard-sheet';

async function post(path: string, body: unknown) {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { code?: string; label?: string };
  return { ok: res.ok, code: json.code, label: json.label };
}

/** Tạo yêu cầu tống đạt rồi thêm văn bản đầu tiên (Figma N12 D11: ngăn kéo 3 bước). */
export function NewServiceSheet({ branches }: { readonly branches: readonly Branch[] }) {
  return (
    <WizardSheet
      trigger="+ Tạo yêu cầu tống đạt"
      title="Tạo yêu cầu tống đạt"
      branches={branches}
      messageFor={messageFor}
      submitLabel="Tạo yêu cầu"
      failTitle="Chưa tạo được yêu cầu"
      steps={[
        { title: 'Yêu cầu', fields: [{ name: 'requestRef', label: 'Mã yêu cầu', max: 200 }] },
        {
          title: 'Người nhận',
          fields: [
            { name: 'recipientName', label: 'Người nhận', max: 300 },
            { name: 'address', label: 'Địa chỉ', max: 500 },
            { name: 'deadline', label: 'Hạn tống đạt', kind: 'datetime' },
          ],
        },
      ]}
      onSubmit={async (v, branch) => {
        const req = await post('/service-of-documents/requests', {
          officeId: branch.officeId,
          branchId: branch.id,
          requestRef: v.requestRef,
        });
        if (!req.ok || !req.label) return req;
        return post(`/service-of-documents/requests/${req.label}/documents`, {
          recipientName: v.recipientName,
          address: v.address,
          deadlineAt: new Date(v.deadline ?? '').toISOString(),
        });
      }}
    />
  );
}

/** Mở hồ sơ xác minh điều kiện thi hành án. */
export function NewVerificationSheet({ branches }: { readonly branches: readonly Branch[] }) {
  return (
    <WizardSheet
      trigger="+ Mở hồ sơ xác minh"
      title="Mở hồ sơ xác minh"
      branches={branches}
      messageFor={messageFor}
      submitLabel="Mở hồ sơ"
      failTitle="Chưa mở được hồ sơ"
      steps={[{ title: 'Hồ sơ', fields: [{ name: 'caseRef', label: 'Mã hồ sơ', max: 200 }] }]}
      onSubmit={(v, branch) =>
        post('/verification/cases', {
          officeId: branch.officeId,
          branchId: branch.id,
          caseRef: v.caseRef,
        })
      }
    />
  );
}

/** Mở hồ sơ tổ chức thi hành án. */
export function NewEnforcementSheet({ branches }: { readonly branches: readonly Branch[] }) {
  return (
    <WizardSheet
      trigger="+ Mở hồ sơ tổ chức THA"
      title="Mở hồ sơ tổ chức thi hành án"
      branches={branches}
      messageFor={messageFor}
      submitLabel="Mở hồ sơ"
      failTitle="Chưa mở được hồ sơ"
      steps={[
        { title: 'Hồ sơ', fields: [{ name: 'caseRef', label: 'Mã hồ sơ', max: 200 }] },
        {
          title: 'Căn cứ',
          fields: [
            { name: 'agreementRef', label: 'Tham chiếu hợp đồng dịch vụ', max: 200 },
            { name: 'decisionRef', label: 'Tham chiếu quyết định hoặc bản án', max: 300 },
          ],
        },
      ]}
      onSubmit={(v, branch) =>
        post('/enforcement-cases', {
          officeId: branch.officeId,
          branchId: branch.id,
          caseRef: v.caseRef,
          agreementRef: v.agreementRef,
          decisionRef: v.decisionRef,
        })
      }
    />
  );
}
