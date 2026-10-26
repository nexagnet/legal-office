-- Đăng nhập bằng link email áp dụng cho MỌI tài khoản (chủ dự án chốt 26/10/2026), không chỉ Admin.
-- Điều kiện còn lại: người dùng có ít nhất một vai trong tenant, tenant đã lưu SMTP (0048) và công tắc chưa tắt (0049).
-- Giới hạn bảo mật giữ nguyên (link dùng một lần, hết hạn, sai mã 5 lần, 3 thư/15 phút, phản hồi đồng nhất).
-- Cột auth_tenant_settings.admin_email_verification giữ tên cũ để không phải đổi dữ liệu; nay là công tắc chung của tenant.

CREATE FUNCTION au_email_login_allowed(p_tenant uuid, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_user)
     AND EXISTS (SELECT 1 FROM office_mail_settings s WHERE s.tenant_id = p_tenant)
     AND COALESCE((SELECT t.admin_email_verification FROM auth_tenant_settings t WHERE t.tenant_id = p_tenant), true)
$$;

DROP FUNCTION au_admin_verification_required(uuid, uuid);
