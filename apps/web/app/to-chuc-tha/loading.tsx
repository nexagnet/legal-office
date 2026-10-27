import { ListSkeleton } from '../../components/skeleton';

/** Đang tải danh sách: khung giữ đúng bố cục để trang không nhảy khi dữ liệu về. */
export default function Loading() {
  return <ListSkeleton title="Tổ chức thi hành án" />;
}
