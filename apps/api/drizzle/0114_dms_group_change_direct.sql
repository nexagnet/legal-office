-- P4c: Admin đổi quyền/thành viên của nhóm trực tiếp (không còn khái niệm "đề xuất" trên giao diện).
-- Chỉ người có quyền duyệt thay đổi quyền (Admin) gọi được; áp dụng ngay, ghi dms_audit_records và một dòng
-- dms_permission_requests (auto_applied) để lịch sử cũ và bản xuất nhật ký vẫn đủ. Người chỉ có quyền "đề xuất" không đổi được.
CREATE OR REPLACE FUNCTION dms_group_change(p_tenant uuid, p_actor uuid, p_group uuid, p_kind text, p_permission text, p_user uuid, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE g dms_permission_groups;
BEGIN
  SELECT * INTO g FROM dms_permission_groups WHERE id = p_group AND tenant_id = p_tenant;
  IF NOT FOUND OR NOT dms_has_permission(p_tenant, p_actor, g.office_id, 'dms.permission.approve') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.group.change', false, 'GROUP_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  RETURN dms_permission_propose(p_tenant, p_actor, p_group, p_kind, p_permission, p_user, p_reason);
END $$;
