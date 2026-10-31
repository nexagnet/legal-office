-- DMS: vai ADMIN của văn phòng mặc nhiên có mọi quyền DMS (owner 2026-10-31), không cần vào nhóm quyền.
--   * Vẫn không có thao tác xoá/ghi đè/sửa trực tiếp bản ghi đã lưu: các luật đó nằm trong hàm nghiệp vụ, không phải mã quyền.
--   * dms_has_permission => true cho ADMIN nên Admin cũng là "Admin" theo nghĩa dms.permission.approve (áp dụng ngay, không cần duyệt).
--   * dms_my_permissions trả đủ danh mục mã quyền để UI hiện nút cho Admin.

CREATE OR REPLACE FUNCTION dms_has_permission(p_tenant uuid, p_actor uuid, p_office uuid, p_code text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships ms
    WHERE ms.tenant_id = p_tenant AND ms.user_id = p_actor AND ms.office_id = p_office AND ms.role = 'ADMIN'
  ) OR EXISTS (
    SELECT 1
    FROM dms_group_members m
    JOIN dms_permission_groups g ON g.id = m.group_id AND g.tenant_id = m.tenant_id
    JOIN dms_group_permissions gp ON gp.group_id = m.group_id AND gp.tenant_id = m.tenant_id
    WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND g.office_id = p_office AND gp.permission = p_code
  );
$$;

CREATE OR REPLACE FUNCTION dms_my_permissions(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (permission text)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT x.permission FROM (
    SELECT d || '.' || a || '.' || s AS permission
    FROM unnest(ARRAY['vibang', 'tongdat', 'xacminh', 'tochuc', 'vtden', 'vtdi', 'vtnb']) d,
         unnest(ARRAY['read', 'draft', 'confirm', 'add_document', 'download']) a,
         unnest(ARRAY['own', 'all']) s
    WHERE EXISTS (SELECT 1 FROM memberships ms
                  WHERE ms.tenant_id = p_tenant AND ms.user_id = p_actor AND ms.office_id = p_office AND ms.role = 'ADMIN')
    UNION ALL
    SELECT c FROM unnest(ARRAY['dms.permission.propose', 'dms.permission.approve', 'dms.stock.write',
                               'dms.legacy.import', 'dms.legacy.read']) c
    WHERE EXISTS (SELECT 1 FROM memberships ms
                  WHERE ms.tenant_id = p_tenant AND ms.user_id = p_actor AND ms.office_id = p_office AND ms.role = 'ADMIN')
    UNION ALL
    SELECT gp.permission
    FROM dms_group_members m
    JOIN dms_permission_groups g ON g.id = m.group_id AND g.tenant_id = m.tenant_id
    JOIN dms_group_permissions gp ON gp.group_id = m.group_id AND gp.tenant_id = m.tenant_id
    WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND g.office_id = p_office
  ) x
  ORDER BY x.permission;
$$;
