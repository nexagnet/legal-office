-- Đăng nhập email + mật khẩu (quyết định của chủ dự án 12/10/2026). Dữ liệu giả lập khi thử.
-- Mật khẩu chỉ lưu dạng băm (scrypt, tính ở ứng dụng); token phiên chỉ lưu SHA-256. Khoá tạm sau 5 lần sai liên tiếp.
-- Phiên chỉ xác định "người dùng nào"; vai và chi nhánh vẫn do các hàm nghiệp vụ kiểm tra từng lần gọi.

CREATE TABLE auth_credentials (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  email text NOT NULL CHECK (email = lower(btrim(email)) AND email ~ '^[^@\s]+@[^@\s]+$' AND length(email) <= 254),
  password_hash text NOT NULL CHECK (btrim(password_hash) <> ''),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id),
  CONSTRAINT auth_credentials_email_uq UNIQUE (tenant_id, email),
  CONSTRAINT auth_credentials_user_fk FOREIGN KEY (user_id, tenant_id) REFERENCES users (id, tenant_id)
);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT auth_sessions_user_fk FOREIGN KEY (user_id, tenant_id) REFERENCES users (id, tenant_id)
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions (tenant_id, user_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['auth_credentials', 'auth_sessions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
END $$;

-- Trạng thái đăng nhập của một email: không ghi gì, không audit.
CREATE FUNCTION au_login_state(p_tenant uuid, p_email text)
RETURNS TABLE (user_id uuid, password_hash text, locked boolean) LANGUAGE sql STABLE AS $$
  SELECT c.user_id, c.password_hash, COALESCE(c.locked_until > now(), false)
  FROM auth_credentials c WHERE c.tenant_id = p_tenant AND c.email = lower(btrim(p_email))
$$;

-- Ghi một lần đăng nhập sai (email không tồn tại cũng audit nhưng không đếm). Khoá 15 phút từ lần sai thứ 5.
CREATE FUNCTION au_login_failed(p_tenant uuid, p_email text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE uid uuid; n integer;
BEGIN
  UPDATE auth_credentials
     SET failed_attempts = failed_attempts + 1,
         locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END,
         updated_at = now()
   WHERE tenant_id = p_tenant AND email = lower(btrim(p_email))
  RETURNING user_id, failed_attempts INTO uid, n;
  RETURN vibang_audit(p_tenant, COALESCE(uid, '00000000-0000-0000-0000-000000000000'::uuid), 'auth.login', false,
    CASE WHEN n >= 5 THEN 'ACCOUNT_LOCKED' ELSE 'INVALID_CREDENTIALS' END, NULL, NULL, NULL);
END $$;

-- Đăng nhập đúng: xoá bộ đếm sai, tạo phiên (chỉ lưu băm token).
CREATE FUNCTION au_login_ok(p_tenant uuid, p_user uuid, p_token_hash text, p_ttl_minutes integer)
RETURNS vibang_op LANGUAGE plpgsql AS $$
BEGIN
  IF p_ttl_minutes IS NULL OR p_ttl_minutes < 1 OR p_ttl_minutes > 10080 OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN vibang_audit(p_tenant, p_user, 'auth.login', false, 'INVALID_SESSION_PARAMS', NULL, NULL, NULL);
  END IF;
  UPDATE auth_credentials SET failed_attempts = 0, locked_until = NULL, updated_at = now()
   WHERE tenant_id = p_tenant AND user_id = p_user;
  INSERT INTO auth_sessions (tenant_id, user_id, token_hash, expires_at)
  VALUES (p_tenant, p_user, p_token_hash, now() + make_interval(mins => p_ttl_minutes));
  RETURN vibang_audit(p_tenant, p_user, 'auth.login', true, 'ALLOWED', NULL, NULL, NULL);
END $$;

-- Trả user_id nếu phiên còn hiệu lực, ngược lại không có dòng.
CREATE FUNCTION au_session(p_tenant uuid, p_token_hash text)
RETURNS TABLE (user_id uuid) LANGUAGE sql STABLE AS $$
  SELECT s.user_id FROM auth_sessions s
  WHERE s.tenant_id = p_tenant AND s.token_hash = p_token_hash AND s.revoked_at IS NULL AND s.expires_at > now()
$$;

CREATE FUNCTION au_logout(p_tenant uuid, p_token_hash text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE uid uuid;
BEGIN
  UPDATE auth_sessions SET revoked_at = now()
   WHERE tenant_id = p_tenant AND token_hash = p_token_hash AND revoked_at IS NULL
  RETURNING user_id INTO uid;
  IF uid IS NULL THEN RETURN ROW(true, 'ALLOWED', NULL)::vibang_op; END IF;
  RETURN vibang_audit(p_tenant, uid, 'auth.logout', true, 'ALLOWED', NULL, NULL, NULL);
END $$;

-- Admin đặt/đổi mật khẩu cho người dùng cùng tenant; thu hồi mọi phiên cũ của người đó.
CREATE FUNCTION au_set_password(p_tenant uuid, p_actor uuid, p_user uuid, p_email text, p_hash text)
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
  INSERT INTO auth_credentials (tenant_id, user_id, email, password_hash)
  VALUES (p_tenant, p_user, em, p_hash)
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, failed_attempts = 0, locked_until = NULL, updated_at = now();
  UPDATE auth_sessions SET revoked_at = now() WHERE tenant_id = p_tenant AND user_id = p_user AND revoked_at IS NULL;
  RETURN vibang_audit(p_tenant, p_actor, 'auth.set_password', true, 'ALLOWED', NULL, NULL, p_user::text);
END $$;
