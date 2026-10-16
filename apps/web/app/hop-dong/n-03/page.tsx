import { FormDraft } from '../../../components/FormDraft';
import { renderDraftPage } from '../../../lib/form-draft-page';

export const dynamic = 'force-dynamic';

export default function Page() {
  return renderDraftPage('Hợp đồng dịch vụ lập Vi bằng · N-03', (officeId) => (
    <FormDraft
      officeId={officeId}
      code="N-03"
      title="Soạn hợp đồng N-03"
      checkTitle="Quy tắc hợp đồng"
      action="Xem trước và xuất Word"
      checks={[
        'Một hợp đồng chứa nhiều Vi bằng',
        'Không bắt buộc hợp đồng khi tiếp nhận',
        'Sinh Word từ mẫu N-03',
        'Nhập Word/PDF ngoài',
        'Không lập sổ thu chi trên hệ thống',
      ]}
      fields={[
        { path: 'office.name', label: 'Văn phòng' },
        { path: 'requester.organization.name', label: 'Bên yêu cầu (tổ chức)' },
        { path: 'requester.person.fullName', label: 'Bên yêu cầu (cá nhân)' },
        { path: 'subjectMatter', label: 'Nội dung thỏa thuận', type: 'textarea' },
        { path: 'signPlace', label: 'Địa điểm ký' },
        { path: 'signDate', label: 'Ngày ký', type: 'date' },
      ]}
    />
  ));
}
