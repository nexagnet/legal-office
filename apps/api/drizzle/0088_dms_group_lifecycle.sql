-- Vòng đời nhóm quyền theo Figma P3/P4/P6/P8 (owner chốt Figma N11, 2026-11-01).
--   * Nhóm có LOẠI (TEMPLATE nhóm mẫu được bảo vệ | CUSTOM tùy chỉnh), PHIÊN BẢN (mỗi lần áp dụng một thay đổi quyền của nhóm
--     thì tăng 1; đổi thành viên không tăng), TRẠNG THÁI (ACTIVE | RETIRED ngừng dùng) và nguồn sao chép.
--   * Nhóm ngừng dùng KHÔNG cấp quyền hiệu lực cho ai (dms_has_permission / dms_my_permissions bỏ qua), nhưng không xoá gì:
--     nhóm, thành viên, quyền và lịch sử yêu cầu đều còn; dùng lại được. Chỉ người có quyền duyệt phân quyền mới đổi trạng thái,
--     áp dụng ngay, có lý do và nhật ký (cùng tinh thần "thu hồi khẩn cấp" của owner).
--   * Nhóm mẫu được bảo vệ: không đổi quyền trực tiếp (GRANT/REVOKE bị từ chối TEMPLATE_PROTECTED), không ngừng dùng.
--     Migration này KHÔNG gieo nhóm mẫu nào: nội dung quyền của từng nhóm mẫu là quyết định nghiệp vụ chưa chốt.
--   * Sao chép nhóm tạo nhóm tùy chỉnh mới, KHÔNG chép các quyền quản trị phân quyền (dms.permission.*): đúng ghi chú Figma
--     "sao chép nhóm mẫu không sao chép các quyền này". Nhóm mới chưa có thành viên; ai vào nhóm vẫn qua yêu cầu có duyệt.
-- Không có phạm vi theo địa điểm ở đây: đó là thay đổi ép quyền trên mọi danh sách DMS, làm riêng.

ALTER TABLE dms_permission_groups
  ADD COLUMN kind text NOT NULL DEFAULT 'CUSTOM' CHECK (kind IN ('TEMPLATE', 'CUSTOM')),
  ADD COLUMN description text CHECK (description IS NULL OR length(description) <= 500),
  ADD COLUMN status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RETIRED')),
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  ADD COLUMN source_group_id uuid,
  ADD COLUMN retired_at timestamptz,
  ADD CONSTRAINT dms_groups_source_fk FOREIGN KEY (source_group_id, tenant_id) REFERENCES dms_permission_groups (id, tenant_id),
  ADD CONSTRAINT dms_groups_retired_chk CHECK ((status = 'RETIRED') = (retired_at IS NOT NULL));

-- Nhóm đã có: phiên bản = 1 + số thay đổi quyền đã được duyệt hoặc Admin áp dụng.
UPDATE dms_permission_groups g
   SET version = 1 + (SELECT count(*) FROM dms_permission_requests r
                      WHERE r.group_id = g.id AND r.tenant_id = g.tenant_id AND r.status = 'APPROVED' AND r.kind IN ('GRANT', 'REVOKE'));

-- Quyền hiệu lực: chỉ tính nhóm đang dùng.
CREATE OR REPLACE FUNCTION dms_has_permission(p_tenant uuid, p_actor uuid, p_office uuid, p_code text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships ms
    WHERE ms.tenant_id = p_tenant AND ms.user_id = p_actor AND ms.office_id = p_office AND ms.role = 'ADMIN'
  ) OR EXISTS (
    SELECT 1
    FROM dms_group_members m
    JOIN dms_permission_groups g ON g.id = m.group_id AND g.tenant_id = m.tenant_id
    JOIN dms_group_permissions gp ON gp.group_id = m.group_id AND gp.tenant_id = m.tenant_id
    WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND g.office_id = p_office AND g.status = 'ACTIVE' AND gp.permission = p_code
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
  ORDER BY x.permission;
$$;

-- Áp dụng một thay đổi (thay bản 0074): từ chối khi nhóm đã ngừng dùng, bảo vệ nhóm mẫu, tăng phiên bản khi đổi quyền,
-- và chỉ đếm người duyệt thuộc nhóm đang dùng khi chặn mất người duyệt cuối.
CREATE OR REPLACE FUNCTION dms_permission_apply(p_tenant uuid, r dms_permission_requests)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE remaining integer; still_valid boolean; grp dms_permission_groups;
BEGIN
  SELECT * INTO grp FROM dms_permission_groups WHERE id = r.group_id AND tenant_id = p_tenant;
  IF NOT FOUND THEN RETURN 'GROUP_NOT_FOUND'; END IF;
  IF grp.status = 'RETIRED' THEN RETURN 'GROUP_RETIRED'; END IF;
  IF grp.kind = 'TEMPLATE' AND r.kind IN ('GRANT', 'REVOKE') THEN RETURN 'TEMPLATE_PROTECTED'; END IF;
  still_valid := CASE r.kind
    WHEN 'GRANT' THEN NOT EXISTS (SELECT 1 FROM dms_group_permissions WHERE group_id = r.group_id AND permission = r.permission)
    WHEN 'REVOKE' THEN EXISTS (SELECT 1 FROM dms_group_permissions WHERE group_id = r.group_id AND permission = r.permission)
    WHEN 'ADD_MEMBER' THEN NOT EXISTS (SELECT 1 FROM dms_group_members WHERE group_id = r.group_id AND user_id = r.user_id)
    ELSE EXISTS (SELECT 1 FROM dms_group_members WHERE group_id = r.group_id AND user_id = r.user_id) END;
  IF NOT still_valid THEN RETURN 'REQUEST_STALE'; END IF;
  IF r.kind = 'REVOKE' AND r.permission = 'dms.permission.approve'
     OR r.kind = 'REMOVE_MEMBER' AND EXISTS (SELECT 1 FROM dms_group_permissions WHERE group_id = r.group_id AND permission = 'dms.permission.approve') THEN
    SELECT count(DISTINCT m.user_id)::integer INTO remaining
    FROM dms_group_members m
    JOIN dms_permission_groups g ON g.id = m.group_id AND g.tenant_id = m.tenant_id
    JOIN dms_group_permissions gp ON gp.group_id = m.group_id AND gp.tenant_id = m.tenant_id
    WHERE m.tenant_id = p_tenant AND g.office_id = r.office_id AND g.status = 'ACTIVE' AND gp.permission = 'dms.permission.approve'
      AND NOT (r.kind = 'REVOKE' AND m.group_id = r.group_id)
      AND NOT (r.kind = 'REMOVE_MEMBER' AND m.group_id = r.group_id AND m.user_id = r.user_id);
    IF remaining = 0 THEN RETURN 'WOULD_REMOVE_LAST_APPROVER'; END IF;
  END IF;
  IF r.kind = 'GRANT' THEN
    INSERT INTO dms_group_permissions (tenant_id, group_id, permission) VALUES (p_tenant, r.group_id, r.permission);
  ELSIF r.kind = 'REVOKE' THEN
    DELETE FROM dms_group_permissions WHERE tenant_id = p_tenant AND group_id = r.group_id AND permission = r.permission;
  ELSIF r.kind = 'ADD_MEMBER' THEN
    INSERT INTO dms_group_members (tenant_id, group_id, user_id) VALUES (p_tenant, r.group_id, r.user_id);
  ELSE
    DELETE FROM dms_group_members WHERE tenant_id = p_tenant AND group_id = r.group_id AND user_id = r.user_id;
  END IF;
  IF r.kind IN ('GRANT', 'REVOKE') THEN
    UPDATE dms_permission_groups SET version = version + 1 WHERE id = r.group_id AND tenant_id = p_tenant;
  END IF;
  RETURN NULL;
END $$;

-- Danh sách nhóm: thêm loại, mô tả, trạng thái, phiên bản, nguồn sao chép.
DROP FUNCTION dms_list_groups(uuid, uuid, uuid);
CREATE FUNCTION dms_list_groups(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (id uuid, name text, permissions text[], member_ids uuid[],
               kind text, description text, status text, version integer, source_group_id uuid)
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.propose')
          OR dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve')) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.group.list', false, 'PERMISSION_DENIED', p_office, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.group.list', true, 'ALLOWED', p_office, NULL, NULL);
  RETURN QUERY
    SELECT g.id, g.name,
           coalesce((SELECT array_agg(gp.permission ORDER BY gp.permission) FROM dms_group_permissions gp WHERE gp.group_id = g.id), '{}'),
           coalesce((SELECT array_agg(m.user_id ORDER BY m.user_id) FROM dms_group_members m WHERE m.group_id = g.id), '{}'),
           g.kind, g.description, g.status, g.version, g.source_group_id
    FROM dms_permission_groups g WHERE g.tenant_id = p_tenant AND g.office_id = p_office ORDER BY g.name;
END $$;

-- Ngừng dùng / dùng lại một nhóm. Người có quyền duyệt phân quyền; áp dụng ngay; lý do bắt buộc; có nhật ký.
CREATE FUNCTION dms_group_set_status(p_tenant uuid, p_actor uuid, p_group uuid, p_status text, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE g dms_permission_groups; remaining integer;
BEGIN
  SELECT * INTO g FROM dms_permission_groups WHERE id = p_group AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND OR NOT dms_has_permission(p_tenant, p_actor, g.office_id, 'dms.permission.approve') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.group.set_status', false, 'GROUP_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('ACTIVE', 'RETIRED') OR btrim(coalesce(p_reason, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.group.set_status', false, 'INVALID_INPUT', g.office_id, NULL, NULL);
  END IF;
  IF g.kind = 'TEMPLATE' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.group.set_status', false, 'TEMPLATE_PROTECTED', g.office_id, NULL, p_group::text);
  END IF;
  IF g.status = p_status THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.group.set_status', false, 'NO_CHANGE', g.office_id, NULL, p_group::text);
  END IF;
  IF p_status = 'RETIRED' AND EXISTS (SELECT 1 FROM dms_group_permissions WHERE group_id = p_group AND permission = 'dms.permission.approve') THEN
    SELECT count(DISTINCT m.user_id)::integer INTO remaining
    FROM dms_group_members m
    JOIN dms_permission_groups og ON og.id = m.group_id AND og.tenant_id = m.tenant_id
    JOIN dms_group_permissions gp ON gp.group_id = m.group_id AND gp.tenant_id = m.tenant_id
    WHERE m.tenant_id = p_tenant AND og.office_id = g.office_id AND og.status = 'ACTIVE' AND gp.permission = 'dms.permission.approve'
      AND m.group_id <> p_group;
    IF remaining = 0 THEN
      RETURN vibang_audit(p_tenant, p_actor, 'dms.group.set_status', false, 'WOULD_REMOVE_LAST_APPROVER', g.office_id, NULL, p_group::text);
    END IF;
  END IF;
  UPDATE dms_permission_groups
     SET status = p_status, retired_at = CASE WHEN p_status = 'RETIRED' THEN now() ELSE NULL END
   WHERE id = p_group AND tenant_id = p_tenant;
  PERFORM dms_audit_rec(p_tenant, g.office_id, p_actor, 'dms.group.set_status', 'group', p_group,
                        jsonb_build_object('status', p_status, 'reason', btrim(p_reason)));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.group.set_status', true,
                      CASE WHEN p_status = 'RETIRED' THEN 'GROUP_RETIRED' ELSE 'GROUP_REACTIVATED' END, g.office_id, NULL, p_group::text);
END $$;

-- Sao chép nhóm: nhóm tùy chỉnh mới, chép quyền trừ dms.permission.*, chưa có thành viên. label = id nhóm mới.
CREATE FUNCTION dms_group_copy(p_tenant uuid, p_actor uuid, p_source uuid, p_name text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE src dms_permission_groups; new_id uuid; nm text := btrim(coalesce(p_name, ''));
BEGIN
  SELECT * INTO src FROM dms_permission_groups WHERE id = p_source AND tenant_id = p_tenant;
  IF NOT FOUND OR NOT (dms_has_permission(p_tenant, p_actor, src.office_id, 'dms.permission.propose')
                       OR dms_has_permission(p_tenant, p_actor, src.office_id, 'dms.permission.approve')) THEN
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
  WHERE gp.group_id = src.id AND gp.tenant_id = p_tenant AND gp.permission NOT LIKE 'dms.permission.%';
  PERFORM dms_audit_rec(p_tenant, src.office_id, p_actor, 'dms.group.copy', 'group', new_id,
                        jsonb_build_object('source_group_id', src.id));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.group.copy', true, 'GROUP_CREATED', src.office_id, NULL, new_id::text);
END $$;

-- Thêm thành viên (thay bản 0087): chỉ xếp vào nhóm đang dùng.
CREATE OR REPLACE FUNCTION ad_member_create(p_tenant uuid, p_actor uuid, p_office uuid, p_email text, p_full_name text,
                                            p_groups uuid[], p_hash text, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE em text := lower(btrim(coalesce(p_email, ''))); uid uuid; gid uuid; op vibang_op; groups uuid[];
BEGIN
  IF NOT dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.member.create', false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  IF em !~ '^[^@\s]+@[^@\s]+$' OR length(em) > 254 OR p_hash IS NULL OR btrim(p_hash) = ''
     OR btrim(coalesce(p_full_name, '')) = '' OR length(p_full_name) > 200 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.member.create', false, 'INVALID_REQUEST', p_office, NULL, NULL);
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.member.create', false, 'REASON_REQUIRED', p_office, NULL, NULL);
  END IF;
  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[]) INTO groups FROM unnest(coalesce(p_groups, ARRAY[]::uuid[])) x;
  IF EXISTS (SELECT 1 FROM unnest(groups) g
             WHERE NOT EXISTS (SELECT 1 FROM dms_permission_groups pg
                               WHERE pg.id = g AND pg.tenant_id = p_tenant AND pg.office_id = p_office AND pg.status = 'ACTIVE')) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.member.create', false, 'GROUP_NOT_FOUND', p_office, NULL, NULL);
  END IF;
  IF EXISTS (SELECT 1 FROM auth_credentials c WHERE c.tenant_id = p_tenant AND c.email = em) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.member.create', false, 'EMAIL_IN_USE', p_office, NULL, NULL);
  END IF;
  INSERT INTO users (tenant_id, external_ref, full_name) VALUES (p_tenant, em, btrim(p_full_name)) RETURNING id INTO uid;
  INSERT INTO auth_credentials (tenant_id, user_id, email, password_hash) VALUES (p_tenant, uid, em, p_hash);
  INSERT INTO memberships (tenant_id, user_id, office_id, role, legal_signer) VALUES (p_tenant, uid, p_office, 'THANH_VIEN', false);
  FOREACH gid IN ARRAY groups LOOP
    op := dms_permission_propose(p_tenant, p_actor, gid, 'ADD_MEMBER', NULL, uid, btrim(p_reason));
    IF op.code <> 'REQUEST_APPLIED' THEN
      RAISE EXCEPTION 'ad_member_create: cannot add member to group (%)', op.code USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END LOOP;
  RETURN vibang_audit(p_tenant, p_actor, 'ad.member.create', true, 'ALLOWED', p_office, NULL, uid::text);
END $$;
