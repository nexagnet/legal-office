import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_STATE_LABEL,
  accountState,
  allPermissionCodes,
  buildPersonRows,
  describeRequest,
  effectiveByDomain,
  effectivePermissions,
  groupPermissionSections,
  groupVersion,
  isGroupActive,
  isTemplateGroup,
  isRequestStale,
  isSensitivePermission,
  makeNameBook,
  permissionLabel,
  permissionMessage,
  requestCode,
  resultOf,
  splitLabel,
  type DmsGroup,
  type PermissionRequest,
} from '../lib/permission-model';

const G1: DmsGroup = {
  id: 'g1',
  name: 'Văn thư chi nhánh',
  permissions: ['vtden.read.all', 'vtden.draft.all', 'dms.permission.propose'],
  member_ids: ['u1'],
};
const G2: DmsGroup = {
  id: 'g2',
  name: 'Kế toán',
  permissions: ['vtden.read.all'],
  member_ids: ['u1', 'u2'],
};

const req = (p: Partial<PermissionRequest>): PermissionRequest => ({
  id: 'aaaaaaaa-0000-4000-8000-00000000abcd',
  group_id: 'g1',
  kind: 'GRANT',
  permission: 'vtden.download.all',
  user_id: null,
  reason: 'x',
  status: 'PENDING',
  proposed_by: 'u9',
  proposed_at: '2026-10-31T00:00:00Z',
  reviewed_by: null,
  reviewed_at: null,
  review_reason: null,
  ...p,
});

describe('nhãn quyền', () => {
  it('đọc được mã quyền nghiệp vụ và mã quản trị', () => {
    expect(permissionLabel('vibang.confirm.own')).toBe(
      'Vi bằng · Xác nhận lưu chính thức (Hồ sơ do tôi tạo)',
    );
    expect(permissionLabel('dms.permission.approve')).toContain('Duyệt thay đổi quyền');
    expect(permissionLabel('la.la.la')).toBe('la.la.la');
  });

  it('đánh dấu quyền nhạy cảm: tải tệp, lưu chính thức, quản trị', () => {
    expect(isSensitivePermission('vtden.download.all')).toBe(true);
    expect(isSensitivePermission('vibang.confirm.own')).toBe(true);
    expect(isSensitivePermission('dms.permission.approve')).toBe(true);
    expect(isSensitivePermission('vibang.read.all')).toBe(false);
  });

  it('quyền duyệt sửa đổi hồ sơ tách khỏi quyền duyệt đổi quyền và là quyền nhạy cảm', () => {
    expect(allPermissionCodes()).toContain('dms.amendment.approve');
    expect(allPermissionCodes()).toContain('vibang.amend_request.own');
    expect(permissionLabel('dms.amendment.approve')).toBe('Duyệt yêu cầu sửa đổi hồ sơ');
    expect(permissionLabel('dms.permission.approve')).toBe('Duyệt thay đổi quyền');
    expect(isSensitivePermission('dms.amendment.approve')).toBe(true);
    expect(isSensitivePermission('vibang.amend_request.own')).toBe(false);
    expect(permissionLabel('vtden.amend_request.all')).toContain('Đề nghị sửa đổi hồ sơ đã lưu');
  });

  it('danh mục gán được gồm 7 nghiệp vụ × 5 hành động × 2 phạm vi + quyền quản trị', () => {
    const all = allPermissionCodes();
    expect(all).toHaveLength(7 * 6 * 2 + 7);
    expect(new Set(all).size).toBe(all.length);
  });

  it('gom quyền của nhóm theo nghiệp vụ, quyền quản trị cuối cùng', () => {
    const s = groupPermissionSections(G1.permissions);
    expect(s.map((x) => x.title)).toEqual(['Văn thư · Văn bản đến', 'Quản trị']);
    expect(s[0]?.items.map((i) => i.code)).toEqual(['vtden.read.all', 'vtden.draft.all']);
  });
});

describe('quyền hiệu lực', () => {
  it('là hợp quyền của mọi nhóm người đó thuộc, không lặp', () => {
    expect(effectivePermissions([G1, G2], 'u1')).toEqual([
      'dms.permission.propose',
      'vtden.draft.all',
      'vtden.read.all',
    ]);
    expect(effectivePermissions([G1, G2], 'u2')).toEqual(['vtden.read.all']);
    expect(effectivePermissions([G1, G2], 'nobody')).toEqual([]);
  });
});

describe('dòng người dùng', () => {
  const members = [
    { userId: 'u1', label: 'An (an@x.test)', role: 'THU_KY', hasLogin: true, branches: ['A'] },
    { userId: 'u1', label: 'An (an@x.test)', role: 'VAN_THU', hasLogin: true, branches: ['B'] },
    { userId: 'u3', label: 'Cường (c@x.test)', role: 'ADMIN', hasLogin: true, branches: [] },
    { userId: 'u4', label: 'Dung (d@x.test)', role: null, hasLogin: false, branches: [] },
    { userId: 'u5', label: 'Hà (h@x.test)', role: null, hasLogin: false, branches: [] },
  ];
  const pending = [req({ kind: 'ADD_MEMBER', permission: null, user_id: 'u4' })];
  const rows = buildPersonRows(members, [G1, G2], pending);

  it('gộp nhiều vai thành một dòng mỗi người', () => {
    expect(rows.map((r) => r.userId)).toEqual(['u1', 'u3', 'u4', 'u5']);
    expect(rows[0]?.branches).toEqual(['A', 'B']);
    expect(rows[0]?.groups.map((g) => g.id)).toEqual(['g1', 'g2']);
  });

  it('tư cách THANH_VIEN không hiện như một "vai cũ"', () => {
    const [p] = buildPersonRows(
      [{ userId: 'u9', label: 'Mới (m@x.test)', role: 'THANH_VIEN', hasLogin: true, branches: [] }],
      [],
      [],
    );
    expect(p?.legacyRole).toBeNull();
    expect(p ? accountState(p) : null).toBe('no-access');
  });

  it('tài khoản tạm khóa thắng mọi trạng thái khác, kể cả Admin', () => {
    const rows2 = buildPersonRows(
      [
        {
          userId: 'a',
          label: 'A (a@x.test)',
          role: 'ADMIN',
          hasLogin: true,
          suspended: true,
          branches: [],
        },
        {
          userId: 'b',
          label: 'B (b@x.test)',
          role: 'THANH_VIEN',
          hasLogin: true,
          suspended: false,
          branches: [],
        },
      ],
      [G1],
      [],
    );
    expect(rows2.map((r) => accountState(r))).toEqual(['suspended', 'no-access']);
    expect(ACCOUNT_STATE_LABEL.suspended).toBe('Tạm khóa');
  });

  it('phân trạng thái tài khoản theo nhóm quyền, không theo vai cũ', () => {
    expect(rows.map((r) => accountState(r))).toEqual(['active', 'active', 'waiting', 'no-access']);
  });
});

describe('yêu cầu đổi quyền', () => {
  const names = makeNameBook([G1], [{ userId: 'u1', label: 'An (an@x.test)' }]);

  it('mô tả bằng tên người và tên nhóm, không lộ UUID', () => {
    expect(describeRequest(req({}), names)).toBe(
      'Nhóm “Văn thư chi nhánh”: thêm quyền Văn thư · Văn bản đến · Tải tệp, in (Mọi hồ sơ của văn phòng)',
    );
    expect(
      describeRequest(req({ kind: 'ADD_MEMBER', permission: null, user_id: 'u1' }), names),
    ).toBe('Gán An vào nhóm “Văn thư chi nhánh”');
  });

  it('báo trước khi yêu cầu đã cũ so với nhóm hiện tại', () => {
    expect(isRequestStale(req({ permission: 'vtden.read.all' }), G1)).toBe(true);
    expect(isRequestStale(req({ permission: 'vtden.download.all' }), G1)).toBe(false);
    expect(isRequestStale(req({ kind: 'REVOKE', permission: 'vtden.download.all' }), G1)).toBe(
      true,
    );
    expect(
      isRequestStale(req({ kind: 'REMOVE_MEMBER', permission: null, user_id: 'u1' }), G1),
    ).toBe(false);
    expect(isRequestStale(req({}), undefined)).toBe(true);
  });

  it('phân biệt Admin tự áp dụng với được duyệt', () => {
    expect(resultOf(req({}))).toBe('pending');
    expect(resultOf(req({ status: 'APPROVED' }))).toBe('applied');
    expect(resultOf(req({ status: 'APPROVED', auto_applied: true }))).toBe('auto');
    expect(resultOf(req({ status: 'REJECTED' }))).toBe('rejected');
  });

  it('mã ngắn lấy từ cuối UUID', () => {
    expect(requestCode('aaaaaaaa-0000-4000-8000-00000000abcd')).toBe('PQ-ABCD');
  });
});

describe('thông báo lỗi', () => {
  it('NO_CHANGE của phân quyền không dùng câu của kho', () => {
    expect(permissionMessage('NO_CHANGE')).toContain('quyền đã có');
    expect(permissionMessage('SELF_APPROVAL_NOT_ALLOWED')).toContain('không được tự duyệt');
  });
  it('tách nhãn tên (email)', () => {
    expect(splitLabel('An (an@x.test)')).toEqual({ name: 'An', email: 'an@x.test' });
    expect(splitLabel('Chỉ tên')).toEqual({ name: 'Chỉ tên', email: null });
  });
});

describe('quyền hiệu lực theo nghiệp vụ', () => {
  it('lấy phạm vi rộng nhất của từng hành động và ghi nguồn nhóm', () => {
    const own: DmsGroup = {
      id: 'g3',
      name: 'Thừa hành viên',
      permissions: ['vtden.read.own', 'vtden.draft.own'],
      member_ids: ['u1'],
    };
    const rows = effectiveByDomain([G1, G2, own], 'u1');
    expect(rows.map((r) => r.domain)).toEqual(['vtden']);
    expect(rows[0]?.actions).toEqual([
      { label: 'Xem hồ sơ', scope: 'all' },
      { label: 'Tạo, sửa, hủy bản nháp', scope: 'all' },
    ]);
    expect(rows[0]?.sources).toEqual(['Văn thư chi nhánh', 'Kế toán', 'Thừa hành viên']);
    expect(effectiveByDomain([G1], 'nobody')).toEqual([]);
  });
});

describe('vòng đời nhóm quyền', () => {
  it('API cũ không có trường mới thì coi là nhóm tùy chỉnh đang dùng, phiên bản 1', () => {
    expect(isGroupActive(G1)).toBe(true);
    expect(isTemplateGroup(G1)).toBe(false);
    expect(groupVersion(G1)).toBe(1);
  });

  it('nhóm ngừng dùng không cấp quyền hiệu lực trên giao diện, giống DB', () => {
    const retired: DmsGroup = { ...G1, status: 'RETIRED', version: 4 };
    expect(groupVersion(retired)).toBe(4);
    expect(isGroupActive(retired)).toBe(false);
    expect(effectivePermissions([retired], 'u1')).toEqual([]);
    expect(effectivePermissions([G1], 'u1')).toContain('vtden.read.all');
  });

  it('có câu tiếng Việt cho nhóm mẫu được bảo vệ và nhóm đã ngừng dùng', () => {
    expect(permissionMessage('TEMPLATE_PROTECTED')).toContain('sao chép');
    expect(permissionMessage('GROUP_RETIRED')).toContain('ngừng dùng');
  });
});
