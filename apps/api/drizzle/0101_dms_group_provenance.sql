-- DMS: chi tiết nhóm quyền hiện "Tạo bởi" và "Duyệt bởi" (Figma P6), lấy từ nhật ký đã có, không thêm bảng.
--   * Tạo bởi / lúc nào: bản ghi nhật ký 'dms.group.create' hoặc 'dms.group.copy' của chính nhóm (nhóm mẫu của hệ thống: không có → NULL).
--   * Duyệt bởi / lúc nào / phiên bản: yêu cầu GRANT/REVOKE được duyệt gần nhất của nhóm (nhóm chưa có đề xuất được duyệt: NULL).
-- Chỉ đọc; quyền xem giữ nguyên như dms_list_groups cũ. Dữ liệu giả lập.
DROP FUNCTION dms_list_groups(uuid, uuid, uuid);
CREATE FUNCTION dms_list_groups(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (id uuid, name text, permissions text[], member_ids uuid[],
               kind text, description text, status text, version integer, source_group_id uuid,
               created_by uuid, created_at timestamptz, approved_by uuid, approved_at timestamptz)
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.propose')
          OR dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve')) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.group.list', false, 'PERMISSION_DENIED', p_office, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.group.list', true, 'ALLOWED', p_office, NULL, NULL);
  RETURN QUERY
    SELECT g.id, g.name,
           coalesce((SELECT array_agg(gp.permission ORDER BY gp.permission) FROM dms_group_permissions gp WHERE gp.group_id = g.id), '{}'),
           coalesce((SELECT array_agg(m.user_id ORDER BY m.user_id) FROM dms_group_members m WHERE m.group_id = g.id), '{}'),
           g.kind, g.description, g.status, g.version, g.source_group_id,
           c.actor_id, c.at, a.reviewed_by, a.reviewed_at
    FROM dms_permission_groups g
    LEFT JOIN LATERAL (
      SELECT r.actor_id, r.at FROM dms_audit_records r
      WHERE r.tenant_id = p_tenant AND r.target_type = 'group' AND r.target_id = g.id
        AND r.action IN ('dms.group.create', 'dms.group.copy')
      ORDER BY r.at, r.id LIMIT 1
    ) c ON true
    LEFT JOIN LATERAL (
      SELECT q.reviewed_by, q.reviewed_at FROM dms_permission_requests q
      WHERE q.tenant_id = p_tenant AND q.group_id = g.id AND q.status = 'APPROVED' AND q.kind IN ('GRANT', 'REVOKE')
      ORDER BY q.reviewed_at DESC, q.id LIMIT 1
    ) a ON true
    WHERE g.tenant_id = p_tenant AND g.office_id = p_office ORDER BY g.name;
END $$;
