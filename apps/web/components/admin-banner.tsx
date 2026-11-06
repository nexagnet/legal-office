'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';

/** Một đoạn của đường dẫn chữ trên banner: có `href` thì là liên kết. */
export type CrumbPart = readonly [label: string, href?: string];

export interface BannerOverride {
  readonly crumb?: readonly CrumbPart[];
  readonly title?: string;
  readonly sub?: string;
}

type Setter = (b: BannerOverride | undefined) => void;

/** AppShell cấp setter; trang Quản trị dùng `AdminBanner` để đưa đường dẫn, tên và mô tả riêng lên banner (Figma N11). */
export const AdminBannerContext = createContext<Setter | null>(null);

export function AdminBanner({ crumb, title, sub }: BannerOverride): ReactNode {
  const set = useContext(AdminBannerContext);
  const key = JSON.stringify([crumb, title, sub]);
  useEffect(() => {
    if (!set) return undefined;
    set({ crumb, title, sub });
    return () => set(undefined);
    // `key` đại diện cho nội dung nên không chạy lại khi mảng crumb được tạo mới mỗi lần render.
  }, [set, key]);
  return null;
}
