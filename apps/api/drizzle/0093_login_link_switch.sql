-- Công tắc "Cho phép đăng nhập bằng link email" (Figma Q8). Dùng đúng cờ sẵn có auth_tenant_settings.admin_email_verification
-- (mặc định BẬT; chỉ có hiệu lực khi đã lưu cấu hình SMTP). Trước đây chỉ đổi được bằng lệnh CLI; nay Admin đổi ngay trên màn Email.
-- Chỉ Admin văn phòng; áp dụng cho mọi người dùng của tenant; mọi lần đổi đều có nhật ký nghiệp vụ. Tắt công tắc làm đăng nhập
-- chỉ còn mật khẩu, nên giao diện nói rõ trước khi tắt. Dữ liệu giả lập.

CREATE FUNCTION of_login_link_enabled(p_tenant uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT t.admin_email_verification FROM auth_tenant_settings t WHERE t.tenant_id = p_tenant), true)
$$;

CREATE FUNCTION ad_login_link_set(p_tenant uuid, p_actor uuid, p_office uuid, p_enabled boolean)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE was boolean;
BEGIN
  IF NOT of_is_office_admin(p_tenant, p_actor, p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.login_link.set', false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  IF p_enabled IS NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.login_link.set', false, 'INVALID_REQUEST', p_office, NULL, NULL);
  END IF;
  was := of_login_link_enabled(p_tenant);
  IF was = p_enabled THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.login_link.set', false, 'NO_CHANGE', p_office, NULL, NULL);
  END IF;
  INSERT INTO auth_tenant_settings (tenant_id, admin_email_verification, updated_at) VALUES (p_tenant, p_enabled, now())
  ON CONFLICT (tenant_id) DO UPDATE SET admin_email_verification = EXCLUDED.admin_email_verification, updated_at = now();
  PERFORM dms_audit_rec(p_tenant, p_office, p_actor, 'ad.login_link.set', 'tenant', p_tenant, jsonb_build_object('enabled', p_enabled));
  RETURN vibang_audit(p_tenant, p_actor, 'ad.login_link.set', true,
                      CASE WHEN p_enabled THEN 'LOGIN_LINK_ENABLED' ELSE 'LOGIN_LINK_DISABLED' END, p_office, NULL, NULL);
END $$;
