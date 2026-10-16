import { FormDraft } from '../../../components/FormDraft';
import { renderDraftPage } from '../../../lib/form-draft-page';

export const dynamic = 'force-dynamic';

export default function Page() {
  return renderDraftPage('Biên soạn nội dung Vi bằng · N-04', (officeId) => (
    <FormDraft
      officeId={officeId}
      code="N-04"
      title="Dữ liệu pháp lý N-04"
      checkTitle="Checklist khi hoàn tất"
      action="Xuất dự thảo Word"
      checks={[
        'Người yêu cầu ký hoặc điểm chỉ',
        'THV ký từng trang nếu áp dụng',
        'Đóng dấu và giáp lai nếu áp dụng',
        'Có hình ảnh THV chứng kiến',
        'Không cần duyệt nháp online riêng',
      ]}
      fields={[
        { path: 'thv.name', label: 'THV' },
        { path: 'thv.cardNo', label: 'Số thẻ THV' },
        { path: 'requester.name', label: 'Người yêu cầu' },
        { path: 'requester.address', label: 'Địa chỉ người yêu cầu' },
        { path: 'participant.name', label: 'Người tham gia khác' },
        { path: 'place', label: 'Địa điểm' },
        { path: 'startDate', label: 'Ngày bắt đầu', type: 'date' },
        { path: 'eventTitle', label: 'Sự kiện, hành vi chứng kiến' },
        {
          path: 'eventContent',
          label: 'Nội dung ghi nhận',
          type: 'textarea',
          placeholder: 'Mô tả trung thực, khách quan',
        },
      ]}
    />
  ));
}
