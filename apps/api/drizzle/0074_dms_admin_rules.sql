-- DMS Phase 1 (lát 4): luật Admin theo quyết định của owner 2026-10-31.
--   * "Admin" = thành viên của nhóm có quyền dms.permission.approve. Admin có toàn quyền quản trị phân quyền:
--     đề xuất do Admin tạo CÓ HIỆU LỰC NGAY, không cần ai duyệt (kể cả thu hồi khẩn cấp). Mọi thao tác vẫn ghi nhật ký.
--   * Người không phải Admin vẫn phải qua Admin duyệt và không tự duyệt (CHECK giữ nguyên cho yêu cầu thường).
--   * Toàn quyền KHÔNG phá luật DMS: không xoá, không ghi đè, không sửa trực tiếp hồ sơ đã lưu (migration này không đụng tới).
--   * Bản nháp đã hủy KHÔNG khôi phục được: không có hàm khôi phục (có test khoá điều đó).
--   * Chốt chặn WOULD_REMOVE_LAST_APPROVER giữ nguyên: Admin không tự khoá mình ra khỏi văn phòng. Khôi phục khi chỉ còn một Admin
--     mà mất quyền truy cập là qua email đăng nhập (thuộc tầng xác thực, không nằm ở đây).
--   * Gieo Admin đầu tiên của văn phòng bằng dms_bootstrap_admin (chỉ chủ CSDL/vận hành gọi; không cấp cho vai ứng dụng).

ALTER TABLE dms_permission_requests ADD COLUMN auto_applied boolean NOT NULL DEFAULT false;
ALTER TABLE dms_permission_requests DROP CONSTRAINT dms_perm_req_no_self_review_chk;
ALTER TABLE dms_permission_requests ADD CONSTRAINT dms_perm_req_no_self_review_chk
  CHECK (reviewed_by IS NULL OR reviewed_by <> proposed_by OR auto_applied);
ALTER TABLE dms_permission_requests ADD CONSTRAINT dms_perm_req_auto_chk
  CHECK (NOT auto_applied OR (status = 'APPROVED' AND reviewed_by = proposed_by));

-- Kiểm tra lại và áp dụng một thay đổi. Trả mã lỗi, hoặc NULL nếu đã áp dụng.
CREATE FUNCTION dms_permission_apply(p_tenant uuid, r dms_permission_requests)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE remaining integer; still_valid boolean;
BEGIN
  still_valid := CASE r.kind
    WHEN 'GRANT' THEN NOT EXISTS (SELECT 1 FROM dms_group_permissions WHERE group_id = r.group_id AND permission = r.permission)
    WHEN 'REVOKE' THEN EXISTS (SELECT 1 FROM dms_group_permissions WHERE group_id = r.group_id AND permission = r.permission)
    WHEN 'ADD_MEMBER' THEN NOT EXISTS (SELECT 1 FROM dms_group_members WHERE group_id = r.group_id AND user_id = r.user_id)
    ELSE EXISTS (SELECT 1 FROM dms_group_members WHERE group_id = r.group_id AND user_id = r.user_id) END;
  IF NOT still_valid THEN RETURN 'REQUEST_STALE'; END IF;
  IF r.kind = 'REVOKE' AND r.permission = 'dms.permission.approve'
     OR r.kind = 'REMOVE_MEMBER' AND EXISTS (SELECT 1 FROM dms_group_permissions WHERE group_id = r.group_id AND permission = 'dms.permission.approve') THEN
    SELECT count(DISTINCT m.user_id)::integer INTO remaining
    FROM dms_group_members m
    JOIN dms_permission_groups g ON g.id = m.group_id AND g.tenant_id = m.tenant_id
    JOIN dms_group_permissions gp ON gp.group_id = m.group_id AND gp.tenant_id = m.tenant_id
    WHERE m.tenant_id = p_tenant AND g.office_id = r.office_id AND gp.permission = 'dms.permission.approve'
      AND NOT (r.kind = 'REVOKE' AND m.group_id = r.group_id)
      AND NOT (r.kind = 'REMOVE_MEMBER' AND m.group_id = r.group_id AND m.user_id = r.user_id);
    IF remaining = 0 THEN RETURN 'WOULD_REMOVE_LAST_APPROVER'; END IF;
  END IF;
  IF r.kind = 'GRANT' THEN
    INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES (p_tenant, r.group_id, r.permission);
  ELSIF r.kind = 'REVOKE' THEN
    DELETE FROM dms_group_permissions WHERE tenant_id = p_tenant AND group_id = r.group_id AND permission = r.permission;
  ELSIF r.kind = 'ADD_MEMBER' THEN
    INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES (p_tenant, r.group_id, r.user_id);
  ELSE
    DELETE FROM dms_group_members WHERE tenant_id = p_tenant AND group_id = r.group_id AND user_id = r.user_id;
  END IF;
  RETURN NULL;
END $$;

-- Đề xuất: người có quyền đề xuất HOẶC quyền duyệt (Admin). Admin => áp dụng ngay (đã duyệt tự động, có dấu auto_applied).
CREATE OR REPLACE FUNCTION dms_permission_propose(p_tenant uuid, p_actor uuid, p_group uuid, p_kind text, p_permission text, p_user uuid, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE g dms_permission_groups; new_id uuid; ok boolean; is_admin boolean; r dms_permission_requests; err text;
BEGIN
  SELECT * INTO g FROM dms_permission_groups WHERE id = p_group AND tenant_id = p_tenant;
  IF NOT FOUND OR NOT (dms_has_permission(p_tenant, p_actor, g.office_id, 'dms.permission.propose')
                       OR dms_has_permission(p_tenant, p_actor, g.office_id, 'dms.permission.approve')) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.propose', false, 'GROUP_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  is_admin := dms_has_permission(p_tenant, p_actor, g.office_id, 'dms.permission.approve');
  IF p_kind IS NULL OR p_kind NOT IN ('GRANT', 'REVOKE', 'ADD_MEMBER', 'REMOVE_MEMBER') OR btrim(coalesce(p_reason, '')) = ''
     OR (p_kind IN ('GRANT', 'REVOKE') AND (p_permission IS NULL OR p_user IS NOT NULL))
     OR (p_kind IN ('ADD_MEMBER', 'REMOVE_MEMBER') AND (p_user IS NULL OR p_permission IS NOT NULL)) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.propose', false, 'INVALID_INPUT', g.office_id, NULL, NULL);
  END IF;
  IF p_kind IN ('GRANT', 'REVOKE') AND NOT (
       p_permission ~ '^(vibang|tongdat|xacminh|tochuc)\.(read|draft|confirm|add_document|download)\.(own|all)$'
       OR p_permission IN ('dms.permission.propose', 'dms.permission.approve')) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.propose', false, 'UNKNOWN_PERMISSION', g.office_id, NULL, NULL);
  END IF;
  IF p_kind IN ('ADD_MEMBER', 'REMOVE_MEMBER') AND NOT EXISTS (SELECT 1 FROM users WHERE id = p_user AND tenant_id = p_tenant) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.propose', false, 'USER_NOT_FOUND', g.office_id, NULL, NULL);
  END IF;
  ok := CASE p_kind
    WHEN 'GRANT' THEN NOT EXISTS (SELECT 1 FROM dms_group_permissions WHERE group_id = p_group AND permission = p_permission)
    WHEN 'REVOKE' THEN EXISTS (SELECT 1 FROM dms_group_permissions WHERE group_id = p_group AND permission = p_permission)
    WHEN 'ADD_MEMBER' THEN NOT EXISTS (SELECT 1 FROM dms_group_members WHERE group_id = p_group AND user_id = p_user)
    ELSE EXISTS (SELECT 1 FROM dms_group_members WHERE group_id = p_group AND user_id = p_user) END;
  IF NOT ok THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.propose', false, 'NO_CHANGE', g.office_id, NULL, NULL);
  END IF;

  IF is_admin THEN
    r.tenant_id := p_tenant; r.office_id := g.office_id; r.group_id := p_group; r.kind := p_kind;
    r.permission := p_permission; r.user_id := p_user;
    err := dms_permission_apply(p_tenant, r);
    IF err IS NOT NULL THEN
      RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.propose', false, err, g.office_id, NULL, NULL);
    END IF;
    INSERT INTO dms_permission_requests (tenant_id, office_id, group_id, kind, permission, user_id, reason, status,
                                         proposed_by, reviewed_by, reviewed_at, review_reason, auto_applied)
    VALUES (p_tenant, g.office_id, p_group, p_kind, p_permission, p_user, btrim(p_reason), 'APPROVED',
            p_actor, p_actor, now(), 'Admin áp dụng trực tiếp', true) RETURNING id INTO new_id;
    PERFORM dms_audit_rec(p_tenant, g.office_id, p_actor, 'dms.permission.apply', 'permission_request', new_id,
                          jsonb_build_object('group_id', p_group, 'kind', p_kind, 'permission', p_permission, 'user_id', p_user, 'by_admin', true));
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.propose', true, 'REQUEST_APPLIED', g.office_id, NULL, new_id::text);
  END IF;

  BEGIN
    INSERT INTO dms_permission_requests (tenant_id, office_id, group_id, kind, permission, user_id, reason, proposed_by)
    VALUES (p_tenant, g.office_id, p_group, p_kind, p_permission, p_user, btrim(p_reason), p_actor) RETURNING id INTO new_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.propose', false, 'ALREADY_PENDING', g.office_id, NULL, NULL);
  END;
  PERFORM dms_audit_rec(p_tenant, g.office_id, p_actor, 'dms.permission.propose', 'permission_request', new_id,
                        jsonb_build_object('group_id', p_group, 'kind', p_kind, 'permission', p_permission, 'user_id', p_user));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.propose', true, 'REQUEST_PROPOSED', g.office_id, NULL, new_id::text);
END $$;

-- Duyệt/từ chối yêu cầu của người không phải Admin. Dùng chung dms_permission_apply.
CREATE OR REPLACE FUNCTION dms_permission_review(p_tenant uuid, p_actor uuid, p_request uuid, p_approve boolean, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE r dms_permission_requests; err text;
BEGIN
  SELECT * INTO r FROM dms_permission_requests WHERE id = p_request AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND OR NOT dms_has_permission(p_tenant, p_actor, r.office_id, 'dms.permission.approve') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.review', false, 'REQUEST_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  IF r.status <> 'PENDING' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.review', false, 'REQUEST_NOT_PENDING', r.office_id, NULL, p_request::text);
  END IF;
  IF r.proposed_by = p_actor THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.review', false, 'SELF_APPROVAL_NOT_ALLOWED', r.office_id, NULL, p_request::text);
  END IF;
  IF p_approve IS NULL OR (NOT p_approve AND btrim(coalesce(p_reason, '')) = '') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.review', false, 'REASON_REQUIRED', r.office_id, NULL, p_request::text);
  END IF;
  IF p_approve THEN
    err := dms_permission_apply(p_tenant, r);
    IF err IS NOT NULL THEN
      RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.review', false, err, r.office_id, NULL, p_request::text);
    END IF;
  END IF;
  UPDATE dms_permission_requests
     SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END, reviewed_by = p_actor, reviewed_at = now(),
         review_reason = nullif(btrim(coalesce(p_reason, '')), '')
   WHERE id = p_request AND tenant_id = p_tenant;
  PERFORM dms_audit_rec(p_tenant, r.office_id, p_actor, 'dms.permission.review', 'permission_request', p_request,
                        jsonb_build_object('approved', p_approve, 'kind', r.kind, 'group_id', r.group_id));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.review', true,
                      CASE WHEN p_approve THEN 'REQUEST_APPROVED' ELSE 'REQUEST_REJECTED' END, r.office_id, NULL, p_request::text);
END $$;

-- Gieo Admin đầu tiên của một văn phòng. Chỉ chạy được khi văn phòng CHƯA có ai giữ quyền duyệt. Không cấp cho vai ứng dụng.
CREATE FUNCTION dms_bootstrap_admin(p_tenant uuid, p_office uuid, p_user uuid, p_group_name text DEFAULT 'Quản trị')
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE gid uuid;
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant::text, true);
  IF NOT EXISTS (SELECT 1 FROM offices WHERE id = p_office AND tenant_id = p_tenant)
     OR NOT EXISTS (SELECT 1 FROM users WHERE id = p_user AND tenant_id = p_tenant) THEN
    RETURN ROW(false, 'NOT_FOUND', NULL)::vibang_op;
  END IF;
  IF EXISTS (
    SELECT 1 FROM dms_group_members m
    JOIN dms_permission_groups g ON g.id = m.group_id AND g.tenant_id = m.tenant_id
    JOIN dms_group_permissions gp ON gp.group_id = m.group_id AND gp.tenant_id = m.tenant_id
    WHERE m.tenant_id = p_tenant AND g.office_id = p_office AND gp.permission = 'dms.permission.approve') THEN
    RETURN vibang_audit(p_tenant, p_user, 'dms.admin.bootstrap', false, 'ADMIN_ALREADY_EXISTS', p_office, NULL, NULL);
  END IF;
  SELECT id INTO gid FROM dms_permission_groups WHERE tenant_id = p_tenant AND office_id = p_office AND name = btrim(p_group_name);
  IF gid IS NULL THEN
    INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES (p_tenant, p_office, btrim(p_group_name)) RETURNING id INTO gid;
  END IF;
  INSERT INTO dms_group_permissions (tenant_id, group_id, permission)
  VALUES (p_tenant, gid, 'dms.permission.propose'), (p_tenant, gid, 'dms.permission.approve') ON CONFLICT DO NOTHING;
  INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES (p_tenant, gid, p_user) ON CONFLICT DO NOTHING;
  PERFORM dms_audit_rec(p_tenant, p_office, p_user, 'dms.admin.bootstrap', 'group', gid, '{}'::jsonb);
  RETURN vibang_audit(p_tenant, p_user, 'dms.admin.bootstrap', true, 'ADMIN_BOOTSTRAPPED', p_office, NULL, gid::text);
END $$;
REVOKE ALL ON FUNCTION dms_bootstrap_admin(uuid, uuid, uuid, text) FROM PUBLIC;
