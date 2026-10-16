-- Quyền sinh bản NHÁP biểu mẫu N (TT 08/2026 PL III). Bản nháp chỉ dựng từ dữ liệu người dùng gửi lên, không đọc hồ sơ.
-- Vai được phép: Admin, Trưởng VP, Thư ký, Văn thư, THV của văn phòng. Kế toán không soạn biểu mẫu nghiệp vụ pháp lý.
-- Mọi lần xin đều ghi audit (kể cả từ chối).
CREATE FUNCTION of_form_authorize(p_tenant uuid, p_actor uuid, p_office uuid, p_form text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = p_office
      AND m.role IN ('ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU', 'THV')
  ) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'form.draft', true, 'ALLOWED', p_office, NULL, p_form);
  END IF;
  RETURN vibang_audit(p_tenant, p_actor, 'form.draft', false, 'ROLE_LACKS_PERMISSION', p_office, NULL, p_form);
END $$;
