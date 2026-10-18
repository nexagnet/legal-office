-- Cấu hình SMTP để gửi email nhắc hạn (owner yêu cầu giao diện cấu hình, 18/10/2026). Cấu hình theo tenant, Admin của bất kỳ văn phòng nào trong tenant sửa.
-- Mật khẩu SMTP chỉ lưu dạng đã mã hoá AES-256-GCM ở ứng dụng (khoá `MAIL_SETTINGS_KEY` nằm ở biến môi trường, không ở DB).
-- Không hàm đọc nào trả mật khẩu cho người dùng; chỉ `of_mail_settings_get` (không có đường HTTP) trả bản mã cho tiến trình gửi thư.
-- Dữ liệu giả lập; không phải tài khoản SMTP thật.

CREATE TABLE office_mail_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants (id),
  host text NOT NULL CHECK (btrim(host) <> '' AND length(host) <= 253),
  port integer NOT NULL CHECK (port BETWEEN 1 AND 65535),
  secure boolean NOT NULL,
  username text CHECK (username IS NULL OR (btrim(username) <> '' AND length(username) <= 254)),
  password_enc text CHECK (password_enc IS NULL OR length(password_enc) <= 2000),
  mail_from text NOT NULL CHECK (btrim(mail_from) <> '' AND length(mail_from) <= 300),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE office_mail_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_mail_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON office_mail_settings
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- p_password_enc NULL + p_keep_password = giữ mật khẩu cũ; NULL + không giữ = xoá mật khẩu.
CREATE FUNCTION of_set_mail_settings(p_tenant uuid, p_actor uuid, p_office uuid, p_host text, p_port integer, p_secure boolean,
                                     p_username text, p_password_enc text, p_keep_password boolean, p_mail_from text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE pw text;
BEGIN
  IF NOT of_is_office_admin(p_tenant, p_actor, p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.mail_settings.set', false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  IF btrim(coalesce(p_host, '')) = '' OR length(p_host) > 253 OR p_host ~ '[\s/@]'
     OR p_port IS NULL OR p_port NOT BETWEEN 1 AND 65535 OR p_secure IS NULL
     OR btrim(coalesce(p_mail_from, '')) = '' OR length(p_mail_from) > 300
     OR (p_username IS NOT NULL AND (btrim(p_username) = '' OR length(p_username) > 254))
     OR (p_password_enc IS NOT NULL AND length(p_password_enc) > 2000) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'of.mail_settings.set', false, 'INVALID_MAIL_SETTINGS', p_office, NULL, NULL);
  END IF;
  pw := CASE WHEN p_password_enc IS NOT NULL THEN p_password_enc
             WHEN coalesce(p_keep_password, false) THEN (SELECT password_enc FROM office_mail_settings WHERE tenant_id = p_tenant)
             ELSE NULL END;
  INSERT INTO office_mail_settings (tenant_id, host, port, secure, username, password_enc, mail_from, updated_by)
  VALUES (p_tenant, btrim(p_host), p_port, p_secure, nullif(btrim(coalesce(p_username, '')), ''), pw, btrim(p_mail_from), p_actor)
  ON CONFLICT (tenant_id) DO UPDATE SET host = EXCLUDED.host, port = EXCLUDED.port, secure = EXCLUDED.secure,
    username = EXCLUDED.username, password_enc = EXCLUDED.password_enc, mail_from = EXCLUDED.mail_from,
    updated_by = p_actor, updated_at = now();
  RETURN vibang_audit(p_tenant, p_actor, 'of.mail_settings.set', true, 'ALLOWED', p_office, NULL, btrim(p_host));
END $$;

-- Chỉ Admin văn phòng đọc được; không trả mật khẩu (chỉ cho biết đã có hay chưa). actor_email = email đăng nhập của chính Admin (nơi gửi thư thử).
-- Chưa cấu hình thì trả một dòng configured = false.
CREATE FUNCTION of_search_mail_settings(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (configured boolean, host text, port integer, secure boolean, username text, has_password boolean, mail_from text,
               updated_at timestamptz, actor_email text)
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT of_is_office_admin(p_tenant, p_actor, p_office) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'of.mail_settings.read', false, 'ADMIN_ONLY', p_office, NULL, NULL);
    RETURN;
  END IF;
  RETURN QUERY
    SELECT s.tenant_id IS NOT NULL, s.host, s.port, s.secure, s.username, s.password_enc IS NOT NULL, s.mail_from, s.updated_at,
           (SELECT c.email FROM auth_credentials c WHERE c.tenant_id = p_tenant AND c.user_id = p_actor)
    FROM (SELECT 1) x LEFT JOIN office_mail_settings s ON s.tenant_id = p_tenant;
END $$;

-- Cho tiến trình gửi thư (CLI) và nút gửi thử: trả cả bản mã mật khẩu. KHÔNG có đường HTTP trực tiếp.
CREATE FUNCTION of_mail_settings_get(p_tenant uuid)
RETURNS TABLE (host text, port integer, secure boolean, username text, password_enc text, mail_from text)
LANGUAGE sql STABLE AS $$
  SELECT s.host, s.port, s.secure, s.username, s.password_enc, s.mail_from FROM office_mail_settings s WHERE s.tenant_id = p_tenant
$$;
