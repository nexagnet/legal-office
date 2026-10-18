-- Xác thực email khi Admin đăng nhập (owner yêu cầu 18/10/2026). Sau bước email + mật khẩu, hệ thống gửi email chứa link dùng một lần;
-- chỉ khi bấm link mới sinh MÃ 6 số, nhập mã vào màn đăng nhập mới có phiên. Mật khẩu vẫn giữ (không làm yếu bảo mật hiện có).
-- Chỉ bắt buộc khi tenant đã lưu cấu hình SMTP (0048), để lần đầu Admin còn vào được mà nhập SMTP. Có công tắc tắt tạm (lệnh CLI) khi SMTP hỏng.
-- Chỉ lưu BĂM của bí mật trình duyệt, token link và mã; mã do DB sinh ra và chỉ trả một lần ở bước bấm link. Dữ liệu giả lập.

CREATE TABLE auth_tenant_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants (id),
  admin_email_verification boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_login_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  secret_hash text NOT NULL CHECK (secret_hash ~ '^[0-9a-f]{64}$'),
  link_hash text NOT NULL CHECK (link_hash ~ '^[0-9a-f]{64}$'),
  code_hash text CHECK (code_hash IS NULL OR code_hash ~ '^[0-9a-f]{64}$'),
  link_expires_at timestamptz NOT NULL,
  link_used_at timestamptz,
  code_expires_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_login_challenges_secret_uq UNIQUE (secret_hash),
  CONSTRAINT auth_login_challenges_link_uq UNIQUE (link_hash),
  CONSTRAINT auth_login_challenges_user_fk FOREIGN KEY (user_id, tenant_id) REFERENCES users (id, tenant_id)
);
CREATE INDEX auth_login_challenges_user_idx ON auth_login_challenges (tenant_id, user_id, created_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['auth_tenant_settings', 'auth_login_challenges'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
END $$;

-- Có phải qua bước email không: người dùng có vai ADMIN, tenant đã lưu SMTP và công tắc chưa bị tắt.
CREATE FUNCTION au_admin_verification_required(p_tenant uuid, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_user AND m.role = 'ADMIN')
     AND EXISTS (SELECT 1 FROM office_mail_settings s WHERE s.tenant_id = p_tenant)
     AND COALESCE((SELECT t.admin_email_verification FROM auth_tenant_settings t WHERE t.tenant_id = p_tenant), true)
$$;

-- Tạo thử thách mới (huỷ các thử thách cũ chưa dùng của người này). Tối đa 3 lần trong 15 phút để không bị dùng làm công cụ gửi thư rác.
CREATE FUNCTION au_challenge_create(p_tenant uuid, p_user uuid, p_secret_hash text, p_link_hash text, p_link_ttl_minutes integer)
RETURNS vibang_op LANGUAGE plpgsql AS $$
BEGIN
  IF p_secret_hash !~ '^[0-9a-f]{64}$' OR p_link_hash !~ '^[0-9a-f]{64}$' OR p_link_ttl_minutes IS NULL OR p_link_ttl_minutes NOT BETWEEN 1 AND 60 THEN
    RETURN vibang_audit(p_tenant, p_user, 'auth.challenge.create', false, 'INVALID_CHALLENGE_PARAMS', NULL, NULL, NULL);
  END IF;
  IF (SELECT count(*) FROM auth_login_challenges c WHERE c.tenant_id = p_tenant AND c.user_id = p_user AND c.created_at > now() - interval '15 minutes') >= 3 THEN
    RETURN vibang_audit(p_tenant, p_user, 'auth.challenge.create', false, 'CHALLENGE_RATE_LIMITED', NULL, NULL, NULL);
  END IF;
  UPDATE auth_login_challenges SET consumed_at = now()
   WHERE tenant_id = p_tenant AND user_id = p_user AND consumed_at IS NULL;
  INSERT INTO auth_login_challenges (tenant_id, user_id, secret_hash, link_hash, link_expires_at)
  VALUES (p_tenant, p_user, p_secret_hash, p_link_hash, now() + make_interval(mins => p_link_ttl_minutes));
  RETURN vibang_audit(p_tenant, p_user, 'auth.challenge.create', true, 'ALLOWED', NULL, NULL, NULL);
END $$;

-- Bấm link: dùng một lần, còn hạn thì sinh MÃ 6 số (hiệu lực 10 phút). Trả mã đúng một lần; DB chỉ giữ băm.
CREATE FUNCTION au_challenge_link(p_tenant uuid, p_link_hash text)
RETURNS TABLE (status text, code text, valid_minutes integer) LANGUAGE plpgsql AS $$
DECLARE ch auth_login_challenges%ROWTYPE; new_code text;
BEGIN
  SELECT * INTO ch FROM auth_login_challenges
   WHERE tenant_id = p_tenant AND link_hash = p_link_hash FOR UPDATE;
  IF NOT FOUND OR ch.consumed_at IS NOT NULL OR ch.link_used_at IS NOT NULL OR ch.link_expires_at <= now() THEN
    PERFORM vibang_audit(p_tenant, COALESCE(ch.user_id, '00000000-0000-0000-0000-000000000000'::uuid), 'auth.challenge.link', false, 'LINK_INVALID', NULL, NULL, NULL);
    RETURN QUERY SELECT 'LINK_INVALID'::text, NULL::text, NULL::integer;
    RETURN;
  END IF;
  new_code := lpad((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))::bit(48)::bigint % 1000000)::text, 6, '0');
  UPDATE auth_login_challenges
     SET link_used_at = now(), code_expires_at = now() + interval '10 minutes',
         code_hash = encode(sha256(convert_to(new_code || ':' || ch.id::text, 'UTF8')), 'hex')
   WHERE id = ch.id;
  PERFORM vibang_audit(p_tenant, ch.user_id, 'auth.challenge.link', true, 'ALLOWED', NULL, NULL, NULL);
  RETURN QUERY SELECT 'OK'::text, new_code, 10;
END $$;

-- Nhập mã ở màn đăng nhập (trình duyệt giữ bí mật). Sai 5 lần thì huỷ. Đúng thì thử thách bị dùng hết và trả user_id để tạo phiên.
CREATE FUNCTION au_challenge_verify(p_tenant uuid, p_secret_hash text, p_code text)
RETURNS TABLE (status text, user_id uuid) LANGUAGE plpgsql AS $$
DECLARE ch auth_login_challenges%ROWTYPE;
BEGIN
  SELECT * INTO ch FROM auth_login_challenges
   WHERE tenant_id = p_tenant AND secret_hash = p_secret_hash FOR UPDATE;
  IF NOT FOUND OR ch.consumed_at IS NOT NULL THEN
    RETURN QUERY SELECT 'CHALLENGE_INVALID'::text, NULL::uuid;
    RETURN;
  END IF;
  IF ch.code_hash IS NULL THEN
    IF ch.link_expires_at <= now() THEN
      UPDATE auth_login_challenges SET consumed_at = now() WHERE id = ch.id;
      PERFORM vibang_audit(p_tenant, ch.user_id, 'auth.challenge.verify', false, 'CHALLENGE_EXPIRED', NULL, NULL, NULL);
      RETURN QUERY SELECT 'CHALLENGE_EXPIRED'::text, NULL::uuid;
    ELSE
      RETURN QUERY SELECT 'CODE_NOT_ISSUED'::text, NULL::uuid;
    END IF;
    RETURN;
  END IF;
  IF ch.code_expires_at <= now() THEN
    UPDATE auth_login_challenges SET consumed_at = now() WHERE id = ch.id;
    PERFORM vibang_audit(p_tenant, ch.user_id, 'auth.challenge.verify', false, 'CHALLENGE_EXPIRED', NULL, NULL, NULL);
    RETURN QUERY SELECT 'CHALLENGE_EXPIRED'::text, NULL::uuid;
    RETURN;
  END IF;
  IF ch.code_hash <> encode(sha256(convert_to(coalesce(p_code, '') || ':' || ch.id::text, 'UTF8')), 'hex') THEN
    UPDATE auth_login_challenges
       SET attempts = attempts + 1, consumed_at = CASE WHEN attempts + 1 >= 5 THEN now() ELSE NULL END
     WHERE id = ch.id;
    PERFORM vibang_audit(p_tenant, ch.user_id, 'auth.challenge.verify', false, CASE WHEN ch.attempts + 1 >= 5 THEN 'CHALLENGE_LOCKED' ELSE 'INVALID_CODE' END, NULL, NULL, NULL);
    RETURN QUERY SELECT CASE WHEN ch.attempts + 1 >= 5 THEN 'CHALLENGE_LOCKED' ELSE 'INVALID_CODE' END::text, NULL::uuid;
    RETURN;
  END IF;
  UPDATE auth_login_challenges SET consumed_at = now() WHERE id = ch.id;
  PERFORM vibang_audit(p_tenant, ch.user_id, 'auth.challenge.verify', true, 'ALLOWED', NULL, NULL, NULL);
  RETURN QUERY SELECT 'OK'::text, ch.user_id;
END $$;

-- Email đăng nhập của người dùng (để gửi link). Không có đường HTTP.
CREATE FUNCTION au_login_email(p_tenant uuid, p_user uuid)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT c.email FROM auth_credentials c WHERE c.tenant_id = p_tenant AND c.user_id = p_user
$$;
