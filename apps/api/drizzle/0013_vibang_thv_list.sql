-- Lát #7: danh sách THV để Admin chọn khi giao hồ sơ. Chỉ Admin của văn phòng thấy; người khác nhận danh sách rỗng
-- (không lộ nhân sự). Chỉ đọc, không ghi audit. Dữ liệu giả lập.
CREATE FUNCTION vb_list_thv(p_tenant uuid, p_actor uuid)
RETURNS TABLE (user_id uuid, office_id uuid, label text)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT u.id, m.office_id, coalesce(ac.email, u.external_ref)
  FROM memberships m
  JOIN users u ON u.id = m.user_id AND u.tenant_id = m.tenant_id
  LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id
  WHERE m.tenant_id = p_tenant AND m.role = 'THV'
    AND EXISTS (SELECT 1 FROM memberships a WHERE a.tenant_id = p_tenant AND a.user_id = p_actor
                  AND a.office_id = m.office_id AND a.role = 'ADMIN')
  ORDER BY 3, 1
$$;
