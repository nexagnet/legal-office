-- Tài khoản (0113): số CCCD, đăng nhập bằng email HOẶC CCCD, buộc đổi mật khẩu lần đầu, quên mật khẩu qua email.
-- Chủ dự án chốt 04/11/2026:
--   * Bắt buộc đặt mật khẩu khi tạo tài khoản; có ô số CCCD; đăng nhập bằng email hoặc CCCD + mật khẩu.
--   * Bỏ đăng nhập bằng link email khỏi màn đăng nhập, thay bằng "Quên mật khẩu".
--   * Khi người dùng đăng nhập lần đầu bắt buộc đổi mật khẩu mới.
-- CCCD là dữ liệu cá nhân nhạy cảm: cột riêng, duy nhất theo tenant, KHÔNG ghi vào nhật ký (audit chỉ ghi mã người dùng).
-- Mật khẩu chỉ lưu dạng băm (scrypt, tính ở ứng dụng); mã đặt lại mật khẩu chỉ lưu SHA-256.

ALTER TABLE auth_credentials
  ADD COLUMN cccd text CHECK (cccd IS NULL OR cccd ~ '^[0-9]{12}$'),
  ADD COLUMN must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN password_changed_at timestamptz;
CREATE UNIQUE INDEX auth_credentials_cccd_uq ON auth_credentials (tenant_id, cccd) WHERE cccd IS NOT NULL;

-- ===== Đăng nhập theo định danh: email hoặc 12 chữ số CCCD =====
DROP FUNCTION au_login_state(uuid, text);
CREATE FUNCTION au_login_state(p_tenant uuid, p_identifier text)
RETURNS TABLE (user_id uuid, password_hash text, locked boolean, must_change boolean) LANGUAGE sql STABLE AS $$
  SELECT c.user_id, c.password_hash, COALESCE(c.locked_until > now(), false), c.must_change_password
    FROM auth_credentials c
   WHERE c.tenant_id = p_tenant
     AND ((btrim(p_identifier) ~ '^[0-9]{12}$' AND c.cccd = btrim(p_identifier)) OR c.email = lower(btrim(p_identifier)))
$$;

DROP FUNCTION au_login_failed(uuid, text);
CREATE FUNCTION au_login_failed(p_tenant uuid, p_identifier text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE uid uuid; n integer;
BEGIN
  UPDATE auth_credentials
     SET failed_attempts = failed_attempts + 1,
         locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END,
         updated_at = now()
   WHERE tenant_id = p_tenant
     AND ((btrim(p_identifier) ~ '^[0-9]{12}$' AND cccd = btrim(p_identifier)) OR email = lower(btrim(p_identifier)))
  RETURNING user_id, failed_attempts INTO uid, n;
  RETURN vibang_audit(p_tenant, COALESCE(uid, '00000000-0000-0000-0000-000000000000'::uuid), 'auth.login', false,
    CASE WHEN n >= 5 THEN 'ACCOUNT_LOCKED' ELSE 'INVALID_CREDENTIALS' END, NULL, NULL, NULL);
END $$;

-- ===== Số CCCD của tài khoản =====
-- Admin của văn phòng (quyền duyệt phân quyền) đặt hoặc xóa (NULL). Trùng trong tenant thì từ chối. Không ghi số vào nhật ký.
CREATE FUNCTION au_set_cccd(p_tenant uuid, p_actor uuid, p_office uuid, p_user uuid, p_cccd text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE num text := nullif(btrim(coalesce(p_cccd, '')), '');
BEGIN
  IF NOT dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'auth.set_cccd', false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_user AND m.office_id = p_office)
     OR NOT EXISTS (SELECT 1 FROM auth_credentials c WHERE c.tenant_id = p_tenant AND c.user_id = p_user) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'auth.set_cccd', false, 'USER_NOT_FOUND', p_office, NULL, NULL);
  END IF;
  IF num IS NOT NULL AND num !~ '^[0-9]{12}$' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'auth.set_cccd', false, 'INVALID_CCCD', p_office, NULL, NULL);
  END IF;
  IF num IS NOT NULL AND EXISTS (SELECT 1 FROM auth_credentials c WHERE c.tenant_id = p_tenant AND c.cccd = num AND c.user_id <> p_user) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'auth.set_cccd', false, 'CCCD_IN_USE', p_office, NULL, NULL);
  END IF;
  UPDATE auth_credentials SET cccd = num, updated_at = now() WHERE tenant_id = p_tenant AND user_id = p_user;
  PERFORM dms_audit_rec(p_tenant, p_office, p_actor, 'auth.set_cccd', 'user', p_user, jsonb_build_object('cleared', num IS NULL));
  RETURN vibang_audit(p_tenant, p_actor, 'auth.set_cccd', true, 'ALLOWED', p_office, NULL, p_user::text);
END $$;

-- Có số CCCD này chưa (để báo trùng TRƯỚC khi tạo tài khoản).
CREATE FUNCTION au_cccd_in_use(p_tenant uuid, p_cccd text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM auth_credentials c WHERE c.tenant_id = p_tenant AND c.cccd = btrim(p_cccd))
$$;

-- Số CCCD của một tài khoản cho Admin xem (danh sách chỉ hiện đuôi 4 số ở web).
CREATE FUNCTION au_get_cccd(p_tenant uuid, p_actor uuid, p_office uuid, p_user uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT c.cccd FROM auth_credentials c
   WHERE c.tenant_id = p_tenant AND c.user_id = p_user
     AND dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve')
     AND EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_user AND m.office_id = p_office)
$$;

-- ===== Buộc đổi mật khẩu lần đầu =====
-- Tài khoản mới tạo và tài khoản Admin vừa đặt lại mật khẩu phải đổi mật khẩu ở lần đăng nhập đầu.
DO $do$
DECLARE r record; def text; patched text;
BEGIN
  SELECT p.oid INTO r FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = current_schema() AND p.proname = 'ad_member_create_core';
  def := pg_get_functiondef(r.oid);
  patched := replace(def, 'INSERT INTO auth_credentials (tenant_id, user_id, email, password_hash) VALUES (p_tenant, uid, em, p_hash);',
                          'INSERT INTO auth_credentials (tenant_id, user_id, email, password_hash, must_change_password) VALUES (p_tenant, uid, em, p_hash, true);');
  IF patched = def THEN RAISE EXCEPTION '0113: ad_member_create_core không có gì để vá'; END IF;
  EXECUTE patched;
END $do$;

CREATE OR REPLACE FUNCTION au_set_password(p_tenant uuid, p_actor uuid, p_user uuid, p_email text, p_hash text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE em text := lower(btrim(COALESCE(p_email, '')));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.role = 'ADMIN') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'auth.set_password', false, 'ADMIN_ONLY', NULL, NULL, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user AND u.tenant_id = p_tenant) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'auth.set_password', false, 'USER_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  IF em !~ '^[^@\s]+@[^@\s]+$' OR length(em) > 254 OR p_hash IS NULL OR btrim(p_hash) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'auth.set_password', false, 'INVALID_CREDENTIAL', NULL, NULL, NULL);
  END IF;
  IF EXISTS (SELECT 1 FROM auth_credentials c WHERE c.tenant_id = p_tenant AND c.email = em AND c.user_id <> p_user) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'auth.set_password', false, 'EMAIL_IN_USE', NULL, NULL, NULL);
  END IF;
  INSERT INTO auth_credentials (tenant_id, user_id, email, password_hash, must_change_password)
  VALUES (p_tenant, p_user, em, p_hash, true)
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, failed_attempts = 0, locked_until = NULL,
        must_change_password = true, password_changed_at = NULL, updated_at = now();
  UPDATE auth_sessions SET revoked_at = now() WHERE tenant_id = p_tenant AND user_id = p_user AND revoked_at IS NULL;
  RETURN vibang_audit(p_tenant, p_actor, 'auth.set_password', true, 'ALLOWED', NULL, NULL, p_user::text);
END $$;

-- Người dùng tự đổi mật khẩu (đã đăng nhập). Giữ phiên hiện tại (p_keep_token_hash), thu hồi các phiên khác.
CREATE FUNCTION au_change_password(p_tenant uuid, p_user uuid, p_new_hash text, p_keep_token_hash text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
BEGIN
  IF p_new_hash IS NULL OR btrim(p_new_hash) = '' THEN
    RETURN vibang_audit(p_tenant, p_user, 'auth.change_password', false, 'INVALID_CREDENTIAL', NULL, NULL, NULL);
  END IF;
  UPDATE auth_credentials
     SET password_hash = p_new_hash, must_change_password = false, password_changed_at = now(),
         failed_attempts = 0, locked_until = NULL, updated_at = now()
   WHERE tenant_id = p_tenant AND user_id = p_user;
  IF NOT FOUND THEN
    RETURN vibang_audit(p_tenant, p_user, 'auth.change_password', false, 'USER_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  UPDATE auth_sessions SET revoked_at = now()
   WHERE tenant_id = p_tenant AND user_id = p_user AND revoked_at IS NULL AND token_hash IS DISTINCT FROM p_keep_token_hash;
  RETURN vibang_audit(p_tenant, p_user, 'auth.change_password', true, 'ALLOWED', NULL, NULL, p_user::text);
END $$;

-- Băm mật khẩu hiện tại để xác nhận khi đổi; và cờ "phải đổi mật khẩu" cho web.
CREATE FUNCTION au_credential_hash(p_tenant uuid, p_user uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT c.password_hash FROM auth_credentials c WHERE c.tenant_id = p_tenant AND c.user_id = p_user
$$;
CREATE FUNCTION au_must_change(p_tenant uuid, p_user uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT c.must_change_password FROM auth_credentials c WHERE c.tenant_id = p_tenant AND c.user_id = p_user), false)
$$;

-- ===== Quên mật khẩu =====
CREATE TABLE auth_password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  CONSTRAINT auth_password_resets_user_fk FOREIGN KEY (user_id, tenant_id) REFERENCES users (id, tenant_id)
);
CREATE INDEX auth_password_resets_user_idx ON auth_password_resets (tenant_id, user_id, created_at);
ALTER TABLE auth_password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_password_resets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON auth_password_resets
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- Tạo mã đặt lại (hủy mã cũ chưa dùng). Tối đa 3 lần trong 30 phút mỗi tài khoản để không thành công cụ gửi thư rác.
CREATE FUNCTION au_reset_create(p_tenant uuid, p_user uuid, p_token_hash text, p_ttl_minutes integer)
RETURNS vibang_op LANGUAGE plpgsql AS $$
BEGIN
  IF p_token_hash !~ '^[0-9a-f]{64}$' OR p_ttl_minutes IS NULL OR p_ttl_minutes NOT BETWEEN 5 AND 120 THEN
    RETURN vibang_audit(p_tenant, p_user, 'auth.reset.create', false, 'INVALID_RESET_PARAMS', NULL, NULL, NULL);
  END IF;
  IF (SELECT count(*) FROM auth_password_resets r WHERE r.tenant_id = p_tenant AND r.user_id = p_user
         AND r.created_at > now() - interval '30 minutes') >= 3 THEN
    RETURN vibang_audit(p_tenant, p_user, 'auth.reset.create', false, 'RESET_RATE_LIMITED', NULL, NULL, NULL);
  END IF;
  UPDATE auth_password_resets SET used_at = now() WHERE tenant_id = p_tenant AND user_id = p_user AND used_at IS NULL;
  INSERT INTO auth_password_resets (tenant_id, user_id, token_hash, expires_at)
  VALUES (p_tenant, p_user, p_token_hash, now() + make_interval(mins => p_ttl_minutes));
  RETURN vibang_audit(p_tenant, p_user, 'auth.reset.create', true, 'ALLOWED', NULL, NULL, NULL);
END $$;

-- Đặt mật khẩu mới bằng mã trong email: dùng một lần, còn hạn. Mở khóa tài khoản, bỏ cờ phải đổi, thu hồi mọi phiên.
CREATE FUNCTION au_reset_redeem(p_tenant uuid, p_token_hash text, p_new_hash text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE r auth_password_resets%ROWTYPE;
BEGIN
  SELECT * INTO r FROM auth_password_resets WHERE tenant_id = p_tenant AND token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND OR r.used_at IS NOT NULL OR r.expires_at <= now() OR p_new_hash IS NULL OR btrim(p_new_hash) = '' THEN
    RETURN vibang_audit(p_tenant, COALESCE(r.user_id, '00000000-0000-0000-0000-000000000000'::uuid), 'auth.reset.redeem', false,
                        'RESET_INVALID', NULL, NULL, NULL);
  END IF;
  UPDATE auth_password_resets SET used_at = now() WHERE id = r.id;
  UPDATE auth_credentials
     SET password_hash = p_new_hash, must_change_password = false, password_changed_at = now(),
         failed_attempts = 0, locked_until = NULL, updated_at = now()
   WHERE tenant_id = p_tenant AND user_id = r.user_id;
  UPDATE auth_sessions SET revoked_at = now() WHERE tenant_id = p_tenant AND user_id = r.user_id AND revoked_at IS NULL;
  RETURN vibang_audit(p_tenant, r.user_id, 'auth.reset.redeem', true, 'ALLOWED', NULL, NULL, r.user_id::text);
END $$;
