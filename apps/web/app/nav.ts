export type Role = 'ADMIN' | 'TRUONG_VP' | 'THU_KY' | 'THV' | 'VAN_THU' | 'KE_TOAN';

export interface NavItem {
  readonly slug: string;
  readonly label: string;
  readonly group: 'domain' | 'office' | 'admin';
  /** Vai được hiển thị mục này. Chỉ để gợi ý menu; quyền thật do API/DB quyết định. */
  readonly roles: readonly Role[];
  readonly summary: string;
}

const ALL: readonly Role[] = ['ADMIN', 'TRUONG_VP', 'THU_KY', 'THV', 'VAN_THU'];
const MANAGE: readonly Role[] = ['ADMIN', 'TRUONG_VP', 'THU_KY'];
/** Kế toán chỉ làm bước xác nhận MISA trên hồ sơ Vi bằng; không thấy ba nghiệp vụ còn lại hay mục văn phòng. */
const WITH_ACCOUNTANT: readonly Role[] = [...ALL, 'KE_TOAN'];

export const OVERVIEW: NavItem = {
  slug: '',
  label: 'Tổng quan',
  group: 'domain',
  roles: WITH_ACCOUNTANT,
  summary: 'Công việc đang chờ theo vai trò.',
};

export const NAV: readonly NavItem[] = [
  {
    slug: 'vi-bang',
    label: 'Vi bằng',
    group: 'domain',
    roles: WITH_ACCOUNTANT,
    summary: 'Hồ sơ lập vi bằng, bằng chứng và số.',
  },
  {
    slug: 'tong-dat',
    label: 'Tống đạt',
    group: 'domain',
    roles: ALL,
    summary: 'Yêu cầu tống đạt văn bản và kết quả.',
  },
  {
    slug: 'xac-minh',
    label: 'Xác minh',
    group: 'domain',
    roles: ALL,
    summary: 'Hồ sơ xác minh điều kiện thi hành án.',
  },
  {
    slug: 'to-chuc-tha',
    label: 'Tổ chức THA',
    group: 'domain',
    roles: ALL,
    summary: 'Hồ sơ tổ chức thi hành án, tài sản và chuyển giao.',
  },
  {
    slug: 'hop-duyet',
    label: 'Hộp duyệt',
    group: 'office',
    roles: ['ADMIN', 'TRUONG_VP', 'THU_KY', 'THV'],
    summary: 'Đề xuất chuyển giao và uỷ quyền chờ duyệt, trả lại, nộp lại.',
  },
  {
    slug: 'hop-dong',
    label: 'Hợp đồng',
    group: 'office',
    roles: MANAGE,
    summary: 'Hợp đồng dịch vụ (không có số tiền kế toán).',
  },
  {
    slug: 'cong-van',
    label: 'Công văn & quyết định',
    group: 'office',
    roles: ALL,
    summary: 'Công văn đi/đến, quyết định và tìm kiếm.',
  },
  {
    slug: 'so-sach',
    label: 'Sổ sách',
    group: 'office',
    roles: MANAGE,
    summary: 'Sổ theo Thông tư 08 (nguồn chiếu từ dữ liệu).',
  },
  {
    slug: 'bieu-mau',
    label: 'Biểu mẫu',
    group: 'office',
    roles: ALL,
    summary: 'Biểu mẫu tải về; Phụ lục TT06 chỉ tải về.',
  },
  {
    slug: 'vat-tu',
    label: 'Vật tư',
    group: 'office',
    roles: [...MANAGE, 'VAN_THU'],
    summary: 'Nhập, xuất, điều chỉnh vật tư theo lô (không có giá).',
  },
  {
    slug: 'bao-cao',
    label: 'Báo cáo',
    group: 'office',
    roles: MANAGE,
    summary: 'Báo cáo tổng hợp từ dữ liệu nghiệp vụ.',
  },
  {
    slug: 'quan-tri',
    label: 'Quản trị',
    group: 'admin',
    roles: ['ADMIN'],
    summary: 'Người dùng, vai trò, chi nhánh và quyền ký.',
  },
];

export function visibleNav(roles: readonly Role[]): readonly NavItem[] {
  return [OVERVIEW, ...NAV].filter((n) => n.roles.some((r) => roles.includes(r)));
}

export function findNav(slug: string): NavItem | undefined {
  return NAV.find((n) => n.slug === slug);
}
