'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Tài khoản phải đổi mật khẩu (mới tạo / Admin vừa đặt lại): mọi trang khác đều chuyển về `/doi-mat-khau` cho tới khi đổi xong.
 * Chỉ là lớp giao diện; quyền thật vẫn do máy chủ kiểm.
 */
export function ForcePasswordChange() {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  useEffect(() => {
    if (pathname !== '/doi-mat-khau') router.replace('/doi-mat-khau');
  }, [pathname, router]);
  return null;
}
