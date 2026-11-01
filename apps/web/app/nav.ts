export type Role = 'ADMIN' | 'TRUONG_VP' | 'THU_KY' | 'THV' | 'VAN_THU' | 'KE_TOAN' | 'THANH_VIEN';

export interface NavItem {
  readonly slug: string;
  readonly label: string;
  readonly group: 'work' | 'domain' | 'office' | 'admin';
  /** Vai được hiển thị mục này. Chỉ để gợi ý menu; quyền thật do API/DB quyết định. */
  readonly roles: readonly Role[];
  readonly summary: string;
  /** Đường dẫn nếu khác `/<slug>` (các trang DMS nằm dưới `/dms`). */
  readonly href?: string;
  /** Không hiện ở menu bên (owner 2026-10-31: ẩn menu quy trình cũ); trang và dữ liệu vẫn còn, truy cập được bằng đường dẫn. */
  readonly hidden?: boolean;
}

/** THANH_VIEN không có quyền từ vai; menu chỉ là gợi ý, quyền thật theo nhóm quyền do API/DB ép. */
const ALL: readonly Role[] = ['ADMIN', 'TRUONG_VP', 'THU_KY', 'THV', 'VAN_THU', 'THANH_VIEN'];
const MANAGE: readonly Role[] = ['ADMIN', 'TRUONG_VP', 'THU_KY'];
/** Kế toán chỉ làm bước xác nhận MISA trên hồ sơ Vi bằng; không thấy ba nghiệp vụ còn lại hay mục văn phòng. */
const WITH_ACCOUNTANT: readonly Role[] = [...ALL, 'KE_TOAN'];

export const OVERVIEW: NavItem = {
  slug: '',
  label: 'Tổng quan',
  group: 'work',
  roles: WITH_ACCOUNTANT,
  summary: 'Công việc đang chờ theo vai trò.',
};

export const NAV: readonly NavItem[] = [
  {
    slug: 'vi-bang',
    hidden: true,
    label: 'Vi bằng',
    group: 'domain',
    roles: WITH_ACCOUNTANT,
    summary: 'Lập, ký và lưu trữ vi bằng theo đúng quy trình hai cổng kiểm soát.',
  },
  {
    slug: 'tong-dat',
    hidden: true,
    label: 'Tống đạt',
    group: 'domain',
    roles: ALL,
    summary: 'Theo dõi giao nhận văn bản, thông báo và chứng từ tống đạt.',
  },
  {
    slug: 'xac-minh',
    hidden: true,
    label: 'Xác minh điều kiện THA',
    group: 'domain',
    roles: ALL,
    summary: 'Thu thập chứng cứ và lập biên bản xác minh điều kiện thi hành án.',
  },
  {
    slug: 'to-chuc-tha',
    hidden: true,
    label: 'Tổ chức thi hành án',
    group: 'domain',
    roles: ALL,
    summary: 'Hồ sơ tổ chức thi hành án, tài sản và chuyển giao.',
  },
  {
    slug: 'dms',
    label: 'Hồ sơ của tôi',
    group: 'work',
    roles: ALL,
    summary: 'Hồ sơ và bản scan bốn nghiệp vụ; xuất sổ S-01/02/04/05.',
  },
  {
    slug: 'dms-vi-bang',
    label: 'Vi bằng',
    group: 'domain',
    roles: ALL,
    href: '/dms/vi-bang',
    summary: 'Đủ 7 cột Sổ S-02 cộng cột tài liệu và bản scan.',
  },
  {
    slug: 'dms-tong-dat',
    label: 'Tống đạt',
    group: 'domain',
    roles: ALL,
    href: '/dms/tong-dat',
    summary: 'Hồ sơ tống đạt và bản scan; xuất Sổ S-01.',
  },
  {
    slug: 'dms-xac-minh',
    label: 'Xác minh điều kiện THA',
    group: 'domain',
    roles: ALL,
    href: '/dms/xac-minh',
    summary: 'Hồ sơ xác minh điều kiện thi hành án và bản scan; xuất Sổ S-04.',
  },
  {
    slug: 'dms-to-chuc-tha',
    label: 'Tổ chức thi hành án',
    group: 'domain',
    roles: ALL,
    href: '/dms/to-chuc-tha',
    summary: 'Hồ sơ tổ chức thi hành án và bản scan; xuất Sổ S-05.',
  },
  {
    slug: 'dms-thv',
    label: 'Chờ tôi xác nhận',
    group: 'work',
    roles: ['ADMIN', 'TRUONG_VP', 'THU_KY', 'THV'],
    href: '/dms/thv',
    summary: 'Bản nháp ghi tên bạn, chờ thừa hành viên xác nhận trước khi lưu chính thức.',
  },
  {
    slug: 'dms-sua-doi',
    label: 'Yêu cầu sửa đổi',
    group: 'work',
    roles: ALL,
    href: '/dms/sua-doi',
    summary: 'Sửa hồ sơ đã lưu chính thức: cần lý do, bản scan văn bản sửa đổi và Admin duyệt.',
  },
  {
    slug: 'viec-cua-toi',
    hidden: true,
    label: 'Việc của tôi',
    group: 'work',
    roles: ALL,
    summary: 'Hồ sơ đang giao cho bạn ở bốn nghiệp vụ.',
  },
  {
    slug: 'hop-duyet',
    hidden: true,
    label: 'Hộp duyệt',
    group: 'work',
    roles: ['ADMIN', 'TRUONG_VP', 'THU_KY', 'THV'],
    summary: 'Đề xuất chuyển giao và uỷ quyền chờ duyệt, trả lại, nộp lại.',
  },
  {
    slug: 'hop-dong',
    hidden: true,
    label: 'Khách hàng & hợp đồng',
    group: 'office',
    roles: MANAGE,
    summary: 'Hợp đồng dịch vụ (không có số tiền kế toán).',
  },
  {
    slug: 'so-sach',
    hidden: true,
    label: 'Sổ sách',
    group: 'office',
    roles: MANAGE,
    summary: 'Sổ theo Thông tư 08 (nguồn chiếu từ dữ liệu).',
  },
  {
    slug: 'bieu-mau',
    label: 'Thư viện biểu mẫu',
    group: 'office',
    roles: ALL,
    summary: 'Biểu mẫu tải về; Phụ lục TT06 chỉ tải về.',
  },
  {
    slug: 'cong-van',
    hidden: true,
    label: 'Công văn đi / đến',
    group: 'office',
    roles: ALL,
    summary: 'Công văn đi/đến, quyết định và tìm kiếm.',
  },
  {
    slug: 'vat-tu',
    label: 'Vật tư văn phòng',
    group: 'office',
    roles: [...MANAGE, 'VAN_THU'],
    summary: 'Nhập, xuất, điều chỉnh vật tư theo lô (không có giá).',
  },
  {
    slug: 'dms-van-thu',
    label: 'Văn thư',
    group: 'office',
    roles: ALL,
    href: '/dms/van-ban-den',
    summary: 'Ba sổ văn bản đến, đi, nội bộ; Số đến và STT tự động, kèm bản scan.',
  },
  {
    slug: 'dms-xuat-so',
    label: 'Xuất sổ nghiệp vụ',
    group: 'office',
    roles: ALL,
    href: '/dms/so',
    summary: 'Xem trước và xuất sổ S-01, S-02, S-04, S-05 theo mẫu.',
  },
  {
    slug: 'dms-bao-cao',
    label: 'Báo cáo tổng hợp',
    group: 'office',
    roles: MANAGE,
    href: '/dms/bao-cao',
    summary: 'Số liệu tổng hợp theo miền và năm từ hồ sơ đã lưu chính thức.',
  },
  {
    slug: 'bao-cao',
    hidden: true,
    label: 'Báo cáo',
    group: 'office',
    roles: MANAGE,
    summary: 'Báo cáo tổng hợp từ dữ liệu nghiệp vụ.',
  },
  {
    slug: 'quan-tri',
    label: 'Người dùng',
    group: 'admin',
    roles: ['ADMIN', 'TRUONG_VP'],
    summary: 'Nhân sự, chi nhánh, phân quyền, thẻ THV, email gửi thư và lịch làm việc.',
  },
  {
    slug: 'cai-dat',
    label: 'Cấu hình hệ thống',
    group: 'admin',
    roles: MANAGE,
    summary: 'Thông tin pháp lý và thiết lập toàn văn phòng.',
  },
];

export function visibleNav(roles: readonly Role[]): readonly NavItem[] {
  return [OVERVIEW, ...NAV].filter((n) => !n.hidden && n.roles.some((r) => roles.includes(r)));
}

export const hrefOf = (i: Pick<NavItem, 'slug' | 'href'>): string => i.href ?? `/${i.slug}`;

export function findNav(slug: string): NavItem | undefined {
  return NAV.find((n) => n.slug === slug);
}

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Quản trị viên',
  TRUONG_VP: 'Trưởng văn phòng',
  THU_KY: 'Thư ký',
  THV: 'Thừa hành viên',
  VAN_THU: 'Văn thư',
  KE_TOAN: 'Kế toán',
  THANH_VIEN: 'Thành viên',
};
