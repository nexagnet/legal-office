-- DMS (0112): nhóm "Admin" hệ thống không xóa được, tài khoản thuộc nhóm Admin không chỉnh quyền riêng được;
-- chỉ Admin tạo / sao chép / xóa nhóm; chỉnh quyền riêng không bắt buộc lý do.
-- Chủ dự án chốt 04/11/2026:
--   * "Nhóm quyền Admin là nhóm không thể xóa và không điều chỉnh riêng cho tài khoản đã gắn với nó."
--   * "Nhóm quyền có thể tạo mới bởi Admin."
--   * "Khi Admin chuyển quyền riêng thì không cần nhập lý do."
-- Danh mục 92 quyền không đổi.

-- ===== 1. Loại nhóm SYSTEM =====
ALTER TABLE dms_permission_groups DROP CONSTRAINT dms_permission_groups_kind_check;
ALTER TABLE dms_permission_groups ADD CONSTRAINT dms_permission_groups_kind_check CHECK (kind IN ('TEMPLATE', 'CUSTOM', 'SYSTEM'));

-- Nhóm SYSTEM: không xóa, không đổi tên / loại / trạng thái; quyền của nó chỉ đổi qua hàm đặt cờ nội bộ.
CREATE FUNCTION dms_system_group_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'dms: nhóm Admin hệ thống không xóa được' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD.kind = 'SYSTEM' AND (NEW.kind <> OLD.kind OR NEW.name <> OLD.name OR NEW.status <> OLD.status OR NEW.office_id <> OLD.office_id) THEN
    RAISE EXCEPTION 'dms: nhóm Admin hệ thống không đổi tên, loại hay trạng thái' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dms_system_group_guard_upd BEFORE UPDATE ON dms_permission_groups
  FOR EACH ROW WHEN (OLD.kind = 'SYSTEM') EXECUTE FUNCTION dms_system_group_guard();
CREATE TRIGGER dms_system_group_guard_del BEFORE DELETE ON dms_permission_groups
  FOR EACH ROW WHEN (OLD.kind = 'SYSTEM') EXECUTE FUNCTION dms_system_group_guard();

-- Quyền của nhóm SYSTEM cố định (chỉ hàm gieo nhóm đặt cờ app.admin_group_seed mới ghi được).
CREATE FUNCTION dms_system_group_perm_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE gid uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.group_id ELSE NEW.group_id END;
BEGIN
  IF EXISTS (SELECT 1 FROM dms_permission_groups g WHERE g.id = gid AND g.kind = 'SYSTEM')
     AND coalesce(current_setting('app.admin_group_seed', true), '') <> '1' THEN
    RAISE EXCEPTION 'dms: quyền của nhóm Admin hệ thống cố định' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER dms_system_group_perm_guard BEFORE INSERT OR UPDATE OR DELETE ON dms_group_permissions
  FOR EACH ROW EXECUTE FUNCTION dms_system_group_perm_guard();

-- ===== 2. Gieo nhóm Admin cho mỗi văn phòng =====
-- Đủ mọi quyền gán được cho nhóm (84 quyền nghiệp vụ + 6 quyền đặc biệt). dms.scan.delete chỉ cấp riêng nên không nằm trong nhóm.
CREATE FUNCTION dms_admin_group_ensure(p_tenant uuid, p_office uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE gid uuid;
BEGIN
  SELECT g.id INTO gid FROM dms_permission_groups g
   WHERE g.tenant_id = p_tenant AND g.office_id = p_office AND g.kind = 'SYSTEM';
  IF FOUND THEN RETURN gid; END IF;
  -- Nhóm tùy chỉnh đã tên "Admin" nhường tên cho nhóm hệ thống.
  UPDATE dms_permission_groups SET name = 'Admin (cũ)'
   WHERE tenant_id = p_tenant AND office_id = p_office AND name = 'Admin' AND kind <> 'SYSTEM';
  INSERT INTO dms_permission_groups (tenant_id, office_id, name, kind, description)
  VALUES (p_tenant, p_office, 'Admin', 'SYSTEM', 'Nhóm quản trị hệ thống: đủ mọi quyền, không xóa được, không chỉnh quyền riêng cho thành viên.')
  RETURNING id INTO gid;
  PERFORM set_config('app.admin_group_seed', '1', true);
  INSERT INTO dms_group_permissions (tenant_id, group_id, permission)
  SELECT p_tenant, gid, d || '.' || a || '.' || s
    FROM unnest(ARRAY['vibang','tongdat','xacminh','tochuc','vtden','vtdi','vtnb']) d,
         unnest(ARRAY['read','draft','confirm','add_document','download','amend_request']) a,
         unnest(ARRAY['own','all']) s
  UNION ALL
  SELECT p_tenant, gid, c FROM unnest(ARRAY['dms.permission.propose','dms.permission.approve','dms.amendment.approve',
                                           'dms.stock.write','dms.legacy.import','dms.legacy.read','dms.audit.export']) c;
  PERFORM set_config('app.admin_group_seed', '', true);
  RETURN gid;
END $$;

DO $do$
DECLARE o record;
BEGIN
  FOR o IN SELECT id, tenant_id FROM offices LOOP PERFORM dms_admin_group_ensure(o.tenant_id, o.id); END LOOP;
END $do$;

CREATE FUNCTION dms_office_admin_group_trg() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM dms_admin_group_ensure(NEW.tenant_id, NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER dms_office_admin_group AFTER INSERT ON offices
  FOR EACH ROW EXECUTE FUNCTION dms_office_admin_group_trg();

-- Tài khoản bị khóa quyền riêng: vai ADMIN hoặc thuộc nhóm SYSTEM (Admin).
CREATE FUNCTION dms_user_override_locked(p_tenant uuid, p_office uuid, p_user uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_user AND m.office_id = p_office AND m.role = 'ADMIN')
      OR EXISTS (SELECT 1 FROM dms_group_members gm JOIN dms_permission_groups g ON g.id = gm.group_id AND g.tenant_id = gm.tenant_id
                  WHERE gm.tenant_id = p_tenant AND gm.user_id = p_user AND g.office_id = p_office AND g.kind = 'SYSTEM');
$$;

-- ===== 3. Chỉ Admin tạo / sao chép nhóm =====
CREATE OR REPLACE FUNCTION dms_group_create(p_tenant uuid, p_actor uuid, p_office uuid, p_name text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE new_id uuid;
BEGIN
  IF NOT dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.group.create', false, 'PERMISSION_DENIED', p_office, NULL, NULL);
  END IF;
  IF btrim(coalesce(p_name, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.group.create', false, 'INVALID_INPUT', p_office, NULL, NULL);
  END IF;
  IF EXISTS (SELECT 1 FROM dms_permission_groups WHERE tenant_id = p_tenant AND office_id = p_office AND name = btrim(p_name)) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.group.create', false, 'GROUP_NAME_IN_USE', p_office, NULL, NULL);
  END IF;
  INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES (p_tenant, p_office, btrim(p_name)) RETURNING id INTO new_id;
  PERFORM dms_audit_rec(p_tenant, p_office, p_actor, 'dms.group.create', 'group', new_id, jsonb_build_object('name', btrim(p_name)));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.group.create', true, 'GROUP_CREATED', p_office, NULL, new_id::text);
END $$;

CREATE OR REPLACE FUNCTION dms_group_copy(p_tenant uuid, p_actor uuid, p_source uuid, p_name text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE src dms_permission_groups; new_id uuid; nm text := btrim(coalesce(p_name, ''));
BEGIN
  SELECT * INTO src FROM dms_permission_groups WHERE id = p_source AND tenant_id = p_tenant;
  IF NOT FOUND OR NOT dms_has_permission(p_tenant, p_actor, src.office_id, 'dms.permission.approve') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.group.copy', false, 'GROUP_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  IF nm = '' OR length(nm) > 200 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.group.copy', false, 'INVALID_INPUT', src.office_id, NULL, NULL);
  END IF;
  IF EXISTS (SELECT 1 FROM dms_permission_groups WHERE tenant_id = p_tenant AND office_id = src.office_id AND name = nm) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.group.copy', false, 'GROUP_NAME_IN_USE', src.office_id, NULL, NULL);
  END IF;
  INSERT INTO dms_permission_groups (tenant_id, office_id, name, kind, description, source_group_id)
  VALUES (p_tenant, src.office_id, nm, 'CUSTOM', 'Sao chép từ ' || src.name, src.id) RETURNING id INTO new_id;
  INSERT INTO dms_group_permissions (tenant_id, group_id, permission)
  SELECT p_tenant, new_id, gp.permission FROM dms_group_permissions gp
  WHERE gp.group_id = src.id AND gp.tenant_id = p_tenant AND gp.permission NOT LIKE 'dms.permission.%' AND gp.permission NOT IN ('dms.amendment.approve', 'dms.audit.export');
  PERFORM dms_audit_rec(p_tenant, src.office_id, p_actor, 'dms.group.copy', 'group', new_id,
                        jsonb_build_object('source_group_id', src.id, 'name', nm));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.group.copy', true, 'GROUP_CREATED', src.office_id, NULL, new_id::text);
END $$;

-- ===== 4. Xóa nhóm =====
-- Chỉ nhóm tùy chỉnh, không còn thành viên và chưa có lịch sử yêu cầu (nhóm đã có lịch sử thì "ngừng dùng" thay vì xóa).
CREATE FUNCTION dms_group_delete(p_tenant uuid, p_actor uuid, p_group uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE g dms_permission_groups;
BEGIN
  SELECT * INTO g FROM dms_permission_groups WHERE id = p_group AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND OR NOT dms_has_permission(p_tenant, p_actor, g.office_id, 'dms.permission.approve') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.group.delete', false, 'GROUP_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  IF g.kind = 'SYSTEM' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.group.delete', false, 'ADMIN_GROUP_PROTECTED', g.office_id, NULL, p_group::text);
  END IF;
  IF g.kind = 'TEMPLATE' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.group.delete', false, 'TEMPLATE_PROTECTED', g.office_id, NULL, p_group::text);
  END IF;
  IF EXISTS (SELECT 1 FROM dms_group_members m WHERE m.group_id = p_group AND m.tenant_id = p_tenant) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.group.delete', false, 'GROUP_HAS_MEMBERS', g.office_id, NULL, p_group::text);
  END IF;
  IF EXISTS (SELECT 1 FROM dms_permission_requests r WHERE r.group_id = p_group AND r.tenant_id = p_tenant)
     OR EXISTS (SELECT 1 FROM dms_permission_groups c WHERE c.source_group_id = p_group AND c.tenant_id = p_tenant) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.group.delete', false, 'GROUP_HAS_HISTORY', g.office_id, NULL, p_group::text);
  END IF;
  DELETE FROM dms_group_permissions WHERE group_id = p_group AND tenant_id = p_tenant;
  DELETE FROM dms_permission_groups WHERE id = p_group AND tenant_id = p_tenant;
  PERFORM dms_audit_rec(p_tenant, g.office_id, p_actor, 'dms.group.delete', 'group', p_group, jsonb_build_object('name', g.name));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.group.delete', true, 'GROUP_DELETED', g.office_id, NULL, p_group::text);
END $$;

-- ===== 5. Quyền riêng: không cần lý do; khóa tài khoản vai ADMIN hoặc thuộc nhóm Admin =====
CREATE OR REPLACE FUNCTION dms_user_overrides_apply(p_tenant uuid, p_actor uuid, p_office uuid, p_user uuid, p_desired text[], p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE
  desired text[]; baseline text[]; target_grant text[]; target_revoke text[];
  cur record; n integer := 0; added text[] := ARRAY[]::text[]; removed text[] := ARRAY[]::text[];
  why text := coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Quản trị viên điều chỉnh quyền riêng');
BEGIN
  IF NOT dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.override', false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  IF length(why) > 1000 OR p_desired IS NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.override', false, 'INVALID_INPUT', p_office, NULL, NULL);
  END IF;
  IF p_user = p_actor THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.override', false, 'SELF_NOT_ALLOWED', p_office, NULL, p_user::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_user AND m.office_id = p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.override', false, 'USER_NOT_FOUND', p_office, NULL, NULL);
  END IF;
  IF dms_user_override_locked(p_tenant, p_office, p_user) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.override', false, 'ADMIN_TARGET', p_office, NULL, p_user::text);
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_desired) c WHERE NOT dms_user_overridable(c)) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.override', false, 'UNKNOWN_PERMISSION', p_office, NULL, NULL);
  END IF;

  SELECT coalesce(array_agg(DISTINCT c), ARRAY[]::text[]) INTO desired FROM unnest(p_desired) c;
  SELECT coalesce(array_agg(DISTINCT gp.permission), ARRAY[]::text[]) INTO baseline
  FROM dms_group_members m
  JOIN dms_permission_groups g ON g.id = m.group_id AND g.tenant_id = m.tenant_id
  JOIN dms_group_permissions gp ON gp.group_id = m.group_id AND gp.tenant_id = m.tenant_id
  WHERE m.tenant_id = p_tenant AND m.user_id = p_user AND g.office_id = p_office AND g.status = 'ACTIVE'
    AND dms_user_overridable(gp.permission);
  SELECT coalesce(array_agg(c), ARRAY[]::text[]) INTO target_grant FROM unnest(desired) c WHERE NOT (c = ANY (baseline));
  SELECT coalesce(array_agg(c), ARRAY[]::text[]) INTO target_revoke FROM unnest(baseline) c WHERE NOT (c = ANY (desired));

  FOR cur IN
    SELECT o.id, o.permission, o.effect FROM dms_user_permission_overrides o
    WHERE o.tenant_id = p_tenant AND o.office_id = p_office AND o.user_id = p_user AND o.ended_at IS NULL FOR UPDATE
  LOOP
    IF (cur.effect = 'GRANT' AND cur.permission = ANY (target_grant)) OR (cur.effect = 'REVOKE' AND cur.permission = ANY (target_revoke)) THEN
      CONTINUE;
    END IF;
    UPDATE dms_user_permission_overrides SET ended_by = p_actor, ended_at = now(), end_reason = why WHERE id = cur.id;
    n := n + 1;
    removed := removed || (cur.effect || ':' || cur.permission);
  END LOOP;
  WITH ins AS (
    INSERT INTO dms_user_permission_overrides (tenant_id, office_id, user_id, permission, effect, set_by, reason)
    SELECT p_tenant, p_office, p_user, t.c, t.e, p_actor, why
    FROM (SELECT c, 'GRANT' AS e FROM unnest(target_grant) c UNION ALL SELECT c, 'REVOKE' FROM unnest(target_revoke) c) t
    WHERE NOT EXISTS (SELECT 1 FROM dms_user_permission_overrides o
                      WHERE o.tenant_id = p_tenant AND o.office_id = p_office AND o.user_id = p_user
                        AND o.permission = t.c AND o.effect = t.e AND o.ended_at IS NULL)
    RETURNING effect, permission
  )
  SELECT coalesce(array_agg(effect || ':' || permission), ARRAY[]::text[]) INTO added FROM ins;
  n := n + coalesce(array_length(added, 1), 0);
  IF n = 0 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.override', false, 'NO_CHANGE', p_office, NULL, p_user::text);
  END IF;
  PERFORM dms_audit_rec(p_tenant, p_office, p_actor, 'dms.permission.override', 'user', p_user,
                        jsonb_build_object('added', to_jsonb(added), 'ended', to_jsonb(removed), 'reason', why));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.override', true, 'OVERRIDES_APPLIED', p_office, NULL, n::text);
END $$;
