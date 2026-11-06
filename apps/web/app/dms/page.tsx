import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** `/dms` không còn là trang riêng: mục menu "Hồ sơ do tôi tạo" thay cho danh sách liên kết cũ. */
export default function DmsHome() {
  redirect('/dms/cua-toi');
}
