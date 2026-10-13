-- Lát #13: danh sách người có quyền ký pháp lý (Admin/Trưởng VP có legal_signer) của văn phòng, để chọn người ký khi vào sổ
-- quyết định. Chỉ vai được vào sổ (Admin, Trưởng VP, Thư ký, Văn thư) mới thấy; người khác nhận danh sách rỗng. Chỉ đọc.
-- Dữ liệu giả lập.
CREATE FUNCTION of_list_signers(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (user_id uuid, label text)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT u.id, coalesce(ac.email, u.external_ref)
  FROM memberships m
  JOIN users u ON u.id = m.user_id AND u.tenant_id = m.tenant_id
  LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id
  WHERE m.tenant_id = p_tenant AND m.office_id = p_office AND m.role IN ('ADMIN', 'TRUONG_VP') AND m.legal_signer
    AND EXISTS (SELECT 1 FROM memberships a WHERE a.tenant_id = p_tenant AND a.user_id = p_actor AND a.office_id = p_office
                  AND a.role IN ('ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU'))
  ORDER BY 2, 1
$$;
