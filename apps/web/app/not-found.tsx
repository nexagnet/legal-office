import Link from 'next/link';
import { StateCard } from '../components/ui/state-card';

export default function NotFound() {
  return (
    <StateCard
      mark="404"
      title="Không tìm thấy"
      description="Trang bạn tìm không tồn tại hoặc đã được chuyển. Kiểm tra lại đường dẫn hoặc quay về Tổng quan."
    >
      <Link
        href="/"
        className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-accent bg-accent px-5 text-sm font-semibold text-white hover:bg-[#17406f]"
      >
        Về Tổng quan
      </Link>
    </StateCard>
  );
}
