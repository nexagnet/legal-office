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

/**
 * Tạo hồ sơ Vi bằng theo từng giai đoạn (Figma N17 V1: ngăn kéo 3 bước, không bắt buộc đủ mọi trường ngay).
 * Tạo khách, lưu hồ sơ khách nếu có tên, rồi tạo hồ sơ (INTAKE). Quyền do máy chủ kiểm.
 */
export function NewViBangSheet({ branches }: { readonly branches: readonly Branch[] }) {
  return (
    <WizardSheet
      trigger="+ Tạo hồ sơ Vi bằng"
      title="Tạo hồ sơ Vi bằng"
      branches={branches}
      messageFor={messageFor}
      submitLabel="Tiếp nhận hồ sơ"
      failTitle="Chưa tạo được hồ sơ"
      steps={[
        {
          title: 'Khách hàng',
          fields: [
            {
              name: 'kind',
              label: 'Loại khách hàng',
              kind: 'select',
              options: [
                ['PERSON', 'Cá nhân'],
                ['ORGANIZATION', 'Tổ chức'],
              ],
            },
            { name: 'customerRef', label: 'Mã tham chiếu khách hàng', max: 200 },
            { name: 'displayName', label: 'Tên khách hàng', max: 300, optional: true },
            { name: 'phone', label: 'Số điện thoại', max: 50, optional: true },
            { name: 'idNumber', label: 'Số định danh cá nhân', max: 100, optional: true },
          ],
        },
        {
          title: 'Nội dung yêu cầu',
          fields: [
            { name: 'title', label: 'Tiêu đề hồ sơ', max: 300 },
            {
              name: 'description',
              label: 'Nội dung yêu cầu lập Vi bằng',
              kind: 'textarea',
              max: 5000,
              optional: true,
            },
          ],
        },
      ]}
      onSubmit={async (v, branch) => {
        const kind = v.kind ?? 'PERSON';
        const displayName = (v.displayName ?? '').trim();
        const phone = (v.phone ?? '').trim();
        const idNumber = kind === 'PERSON' ? (v.idNumber ?? '').trim() : '';
        if ((phone || idNumber) && !displayName) {
          return { ok: false, code: 'DISPLAY_NAME_REQUIRED' };
        }
        const customer = await post('/vibang/customers', {
          kind,
          externalRef: v.customerRef ?? '',
        });
        if (!customer.ok || !customer.label) return customer;
        if (displayName) {
          const saved = await post(`/vibang/customers/${customer.label}/profile`, {
            displayName,
            ...(phone ? { phone } : {}),
            ...(idNumber ? { idNumber } : {}),
          });
          if (!saved.ok) return saved;
        }
        return post('/vibang/cases', {
          officeId: branch.officeId,
          branchId: branch.id,
          customerId: customer.label,
          title: v.title ?? '',
          description: v.description ?? '',
        });
      }}
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
