-- Danh bạ thành viên văn phòng cho Quản trị: vai, cờ quyền ký pháp lý, chi nhánh được cấp, đã có tài khoản đăng nhập hay chưa.
-- CHỈ ĐỌC và CHỈ Admin của văn phòng; không trả băm mật khẩu hay thông tin khoá tài khoản. Việc cấp/đổi vai và quyền ký
-- chưa có trong hệ thống: đó là quyết định của chủ (mở rộng quyền cần cổng người).
CREATE FUNCTION of_search_members(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (user_id uuid, label text, role text, legal_signer boolean, has_login boolean, branches text[])
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships a WHERE a.tenant_id = p_tenant AND a.user_id = p_actor AND a.office_id = p_office AND a.role = 'ADMIN') THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'of.members.search', false, 'ADMIN_ONLY', p_office, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'of.members.search', true, 'ALLOWED', p_office, NULL, NULL);
  RETURN QUERY
    SELECT m.user_id, coalesce(ac.email, u.external_ref), m.role, m.legal_signer, ac.user_id IS NOT NULL,
           coalesce((SELECT array_agg(b.name ORDER BY b.name) FROM branch_grants g
                     JOIN branches b ON b.id = g.branch_id AND b.tenant_id = g.tenant_id
                     WHERE g.membership_id = m.id AND g.tenant_id = p_tenant), ARRAY[]::text[])
    FROM memberships m
    JOIN users u ON u.id = m.user_id AND u.tenant_id = m.tenant_id
    LEFT JOIN auth_credentials ac ON ac.user_id = m.user_id AND ac.tenant_id = m.tenant_id
    WHERE m.tenant_id = p_tenant AND m.office_id = p_office
    ORDER BY m.role, 2, m.user_id;
END $$;
