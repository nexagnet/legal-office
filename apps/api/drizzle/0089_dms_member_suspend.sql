-- Tạm khóa tài khoản (Figma Q1 "Tạm khóa", Q2 "Ngừng hoạt động: thu hồi quyền, giữ lịch sử").
--   * Không xoá gì: người dùng, thành viên nhóm, hồ sơ và nhật ký đều giữ nguyên. Tạm khóa chỉ làm tài khoản không còn đăng nhập
--     được và không còn quyền hiệu lực; mở lại thì quyền theo nhóm hiện có trở lại.
--   * Người có quyền duyệt phân quyền (Admin) thực hiện, áp dụng ngay, không cần ai duyệt (quyết định owner 2026-10-31), luôn có
--     lý do và nhật ký. Không tự khóa mình; không khóa người duyệt cuối cùng của văn phòng (khóa Admin duy nhất = mất khả năng khôi phục).
--   * Khóa: thu hồi mọi phiên đang mở; au_session không trả phiên; au_login_ok từ chối; đăng nhập qua link email bị chặn.
--   * dms_has_permission / dms_my_permissions trả "không có quyền" cho tài khoản đang khóa (chốt chặn thứ hai, ngoài phiên).
-- Dữ liệu giả lập.

ALTER TABLE users
  ADD COLUMN suspended_at timestamptz,
  ADD COLUMN suspended_by uuid,
  ADD COLUMN suspend_reason text CHECK (suspend_reason IS NULL OR (btrim(suspend_reason) <> '' AND length(suspend_reason) <= 1000)),
  ADD CONSTRAINT users_suspend_shape_chk CHECK ((suspended_at IS NULL) = (suspend_reason IS NULL));

CREATE FUNCTION dms_user_suspended(p_tenant uuid, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM users u WHERE u.tenant_id = p_tenant AND u.id = p_user AND u.suspended_at IS NOT NULL)
$$;

-- Phiên của tài khoản đang khóa không còn hiệu lực dù còn hạn.
CREATE OR REPLACE FUNCTION au_session(p_tenant uuid, p_token_hash text)
RETURNS TABLE (user_id uuid) LANGUAGE sql STABLE AS $$
  SELECT s.user_id FROM auth_sessions s
  WHERE s.tenant_id = p_tenant AND s.token_hash = p_token_hash AND s.revoked_at IS NULL AND s.expires_at > now()
    AND NOT dms_user_suspended(p_tenant, s.user_id)
$$;

CREATE OR REPLACE FUNCTION au_login_ok(p_tenant uuid, p_user uuid, p_token_hash text, p_ttl_minutes integer)
RETURNS vibang_op LANGUAGE plpgsql AS $$
BEGIN
  IF p_ttl_minutes IS NULL OR p_ttl_minutes < 1 OR p_ttl_minutes > 10080 OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN vibang_audit(p_tenant, p_user, 'auth.login', false, 'INVALID_SESSION_PARAMS', NULL, NULL, NULL);
  END IF;
  IF dms_user_suspended(p_tenant, p_user) THEN
    RETURN vibang_audit(p_tenant, p_user, 'auth.login', false, 'ACCOUNT_SUSPENDED', NULL, NULL, NULL);
  END IF;
  UPDATE auth_credentials SET failed_attempts = 0, locked_until = NULL, updated_at = now()
   WHERE tenant_id = p_tenant AND user_id = p_user;
  INSERT INTO auth_sessions (tenant_id, user_id, token_hash, expires_at)
  VALUES (p_tenant, p_user, p_token_hash, now() + make_interval(mins => p_ttl_minutes));
  RETURN vibang_audit(p_tenant, p_user, 'auth.login', true, 'ALLOWED', NULL, NULL, NULL);
END $$;

CREATE OR REPLACE FUNCTION au_email_login_allowed(p_tenant uuid, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_user)
     AND NOT dms_user_suspended(p_tenant, p_user)
     AND EXISTS (SELECT 1 FROM office_mail_settings s WHERE s.tenant_id = p_tenant)
     AND COALESCE((SELECT t.admin_email_verification FROM auth_tenant_settings t WHERE t.tenant_id = p_tenant), true)
$$;

CREATE OR REPLACE FUNCTION dms_has_permission(p_tenant uuid, p_actor uuid, p_office uuid, p_code text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT NOT dms_user_suspended(p_tenant, p_actor) AND (
    EXISTS (
      SELECT 1 FROM memberships ms
      WHERE ms.tenant_id = p_tenant AND ms.user_id = p_actor AND ms.office_id = p_office AND ms.role = 'ADMIN'
    ) OR EXISTS (
      SELECT 1
      FROM dms_group_members m
      JOIN dms_permission_groups g ON g.id = m.group_id AND g.tenant_id = m.tenant_id
      JOIN dms_group_permissions gp ON gp.group_id = m.group_id AND gp.tenant_id = m.tenant_id
      WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND g.office_id = p_office AND g.status = 'ACTIVE' AND gp.permission = p_code
    )
  );
$$;

CREATE OR REPLACE FUNCTION dms_my_permissions(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (permission text)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT x.permission FROM (
    SELECT d || '.' || a || '.' || s AS permission
    FROM unnest(ARRAY['vibang', 'tongdat', 'xacminh', 'tochuc', 'vtden', 'vtdi', 'vtnb']) d,
         unnest(ARRAY['read', 'draft', 'confirm', 'add_document', 'download']) a,
         unnest(ARRAY['own', 'all']) s
    WHERE EXISTS (SELECT 1 FROM memberships ms
                  WHERE ms.tenant_id = p_tenant AND ms.user_id = p_actor AND ms.office_id = p_office AND ms.role = 'ADMIN')
    UNION ALL
    SELECT c FROM unnest(ARRAY['dms.permission.propose', 'dms.permission.approve', 'dms.stock.write',
                               'dms.legacy.import', 'dms.legacy.read']) c
    WHERE EXISTS (SELECT 1 FROM memberships ms
                  WHERE ms.tenant_id = p_tenant AND ms.user_id = p_actor AND ms.office_id = p_office AND ms.role = 'ADMIN')
    UNION ALL
    SELECT gp.permission
    FROM dms_group_members m
    JOIN dms_permission_groups g ON g.id = m.group_id AND g.tenant_id = m.tenant_id
    JOIN dms_group_permissions gp ON gp.group_id = m.group_id AND gp.tenant_id = m.tenant_id
    WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND g.office_id = p_office AND g.status = 'ACTIVE'
  ) x
  WHERE NOT dms_user_suspended(p_tenant, p_actor)
  ORDER BY x.permission;
$$;

-- Khóa / mở khóa. label = 'SUSPENDED' | 'ACTIVE' (trạng thái mới).
CREATE FUNCTION ad_member_suspend(p_tenant uuid, p_actor uuid, p_office uuid, p_user uuid, p_suspend boolean, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE remaining integer; was boolean;
BEGIN
  IF NOT dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.member.suspend', false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  IF p_suspend IS NULL OR btrim(coalesce(p_reason, '')) = '' OR length(p_reason) > 1000 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.member.suspend', false, 'REASON_REQUIRED', p_office, NULL, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_user AND m.office_id = p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.member.suspend', false, 'USER_NOT_FOUND', p_office, NULL, NULL);
  END IF;
  IF p_suspend AND p_user = p_actor THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.member.suspend', false, 'SELF_TARGET_NOT_ALLOWED', p_office, NULL, p_user::text);
  END IF;
  SELECT u.suspended_at IS NOT NULL INTO was FROM users u WHERE u.id = p_user AND u.tenant_id = p_tenant FOR UPDATE;
  IF was = p_suspend THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.member.suspend', false, 'NO_CHANGE', p_office, NULL, p_user::text);
  END IF;
  IF p_suspend THEN
    -- Còn ít nhất một người duyệt khác, chưa bị khóa, thì mới khóa được.
    SELECT count(DISTINCT a.user_id)::integer INTO remaining FROM (
      SELECT ms.user_id FROM memberships ms WHERE ms.tenant_id = p_tenant AND ms.office_id = p_office AND ms.role = 'ADMIN'
      UNION
      SELECT m.user_id FROM dms_group_members m
        JOIN dms_permission_groups g ON g.id = m.group_id AND g.tenant_id = m.tenant_id
        JOIN dms_group_permissions gp ON gp.group_id = m.group_id AND gp.tenant_id = m.tenant_id
       WHERE m.tenant_id = p_tenant AND g.office_id = p_office AND g.status = 'ACTIVE' AND gp.permission = 'dms.permission.approve'
    ) a
    WHERE a.user_id <> p_user AND NOT dms_user_suspended(p_tenant, a.user_id);
    IF remaining = 0 THEN
      RETURN vibang_audit(p_tenant, p_actor, 'ad.member.suspend', false, 'WOULD_REMOVE_LAST_APPROVER', p_office, NULL, p_user::text);
    END IF;
    UPDATE users SET suspended_at = now(), suspended_by = p_actor, suspend_reason = btrim(p_reason)
     WHERE id = p_user AND tenant_id = p_tenant;
    UPDATE auth_sessions SET revoked_at = now() WHERE tenant_id = p_tenant AND user_id = p_user AND revoked_at IS NULL;
  ELSE
    UPDATE users SET suspended_at = NULL, suspended_by = NULL, suspend_reason = NULL
     WHERE id = p_user AND tenant_id = p_tenant;
  END IF;
  PERFORM dms_audit_rec(p_tenant, p_office, p_actor, CASE WHEN p_suspend THEN 'ad.member.suspend' ELSE 'ad.member.reactivate' END,
                        'user', p_user, jsonb_build_object('reason', btrim(p_reason)));
  RETURN vibang_audit(p_tenant, p_actor, CASE WHEN p_suspend THEN 'ad.member.suspend' ELSE 'ad.member.reactivate' END, true,
                      CASE WHEN p_suspend THEN 'MEMBER_SUSPENDED' ELSE 'MEMBER_REACTIVATED' END, p_office, NULL, p_user::text);
END $$;

-- Danh sách thành viên: thêm cờ suspended (đổi kiểu trả về nên phải DROP rồi tạo lại).
DROP FUNCTION of_search_members(uuid, uuid, uuid);
CREATE FUNCTION of_search_members(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (user_id uuid, label text, role text, legal_signer boolean, has_login boolean, branches text[], suspended boolean)
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships a WHERE a.tenant_id = p_tenant AND a.user_id = p_actor AND a.office_id = p_office AND a.role = 'ADMIN') THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'of.members.search', false, 'ADMIN_ONLY', p_office, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'of.members.search', true, 'ALLOWED', p_office, NULL, NULL);
  RETURN QUERY
    SELECT m.user_id, ad_user_label(u.full_name, ac.email, u.external_ref), m.role, m.legal_signer, ac.user_id IS NOT NULL,
           coalesce((SELECT array_agg(b.name ORDER BY b.name) FROM branch_grants g
                     JOIN branches b ON b.id = g.branch_id AND b.tenant_id = g.tenant_id
                     WHERE g.membership_id = m.id AND g.tenant_id = p_tenant), ARRAY[]::text[]),
           u.suspended_at IS NOT NULL
    FROM memberships m
    JOIN users u ON u.id = m.user_id AND u.tenant_id = m.tenant_id
    LEFT JOIN auth_credentials ac ON ac.user_id = m.user_id AND ac.tenant_id = m.tenant_id
    WHERE m.tenant_id = p_tenant AND m.office_id = p_office
    UNION ALL
    SELECT u.id, ad_user_label(u.full_name, ac.email, u.external_ref), NULL::text, false, ac.user_id IS NOT NULL, ARRAY[]::text[],
           u.suspended_at IS NOT NULL
    FROM users u
    LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id
    WHERE u.tenant_id = p_tenant
      AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = u.id AND m.office_id = p_office)
    ORDER BY 3 NULLS LAST, 2, 1;
END $$;
