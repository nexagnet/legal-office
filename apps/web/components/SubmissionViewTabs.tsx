import { TabNav } from './ui/tab-nav';

/** Hai chế độ của mục "Trình / Duyệt": bản trình, và bản nháp đang chờ tôi xác nhận. */
export function SubmissionViewTabs({ active }: { readonly active: 'submissions' | 'drafts' }) {
  return (
    <TabNav
      label="Loại việc chờ"
      soft
      active={active}
      tabs={[
        { key: 'submissions', label: 'Bản trình', href: '/dms/trinh-duyet' },
        { key: 'drafts', label: 'Nháp chờ tôi lưu', href: '/dms/thv' },
      ]}
    />
  );
}
