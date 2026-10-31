-- DMS Phase 1 (lát 2a): quản lý Nhóm quyền qua YÊU CẦU ĐỔI QUYỀN có duyệt (owner 2026-10-30/31).
-- Quy tắc ép ở CSDL:
--   * Quyền trong nhóm và thành viên nhóm chỉ đổi qua yêu cầu: đề xuất (dms.permission.propose) rồi duyệt (dms.permission.approve).
--   * Người đề xuất KHÔNG tự duyệt (CHECK reviewed_by <> proposed_by). Không có "Trưởng văn phòng duyệt" theo vai.
--   * Duyệt xong áp dụng ngay trong cùng giao dịch, nên thu hồi quyền có hiệu lực tức thì.
--   * Từ chối không đổi gì. Yêu cầu chỉ ghi một lần (PENDING -> APPROVED | REJECTED), không xoá.
--   * Không cho một thay đổi làm văn phòng mất hết người có quyền duyệt (WOULD_REMOVE_LAST_APPROVER). Đây chỉ là chốt chặn
--     phòng ngừa; quy trình khôi phục khi "chỉ còn một Admin / mất hết Admin" vẫn là OWNER-DECISION, chưa chọn.
-- Nhóm quyền ĐẦU TIÊN của văn phòng và người duyệt đầu tiên do vận hành gieo bằng kết nối chủ CSDL (không có hàm bootstrap
-- vì phụ thuộc quyết định "chỉ còn một Admin" chưa chốt). Dữ liệu giả lập; nhật ký không PII.

-- Mở danh mục mã quyền: thêm hai mã quản trị phân quyền (hai quyền duyệt tách biệt; quyền duyệt sửa đổi sẽ thêm ở Phase 4).
ALTER TABLE dms_group_permissions DROP CONSTRAINT dms_group_permissions_permission_check;
ALTER TABLE dms_group_permissions ADD CONSTRAINT dms_group_permissions_permission_check CHECK (
  permission ~ '^(vibang|tongdat|xacminh|tochuc)\.(read|draft|confirm|add_document|download)\.(own|all)$'
  OR permission IN ('dms.permission.propose', 'dms.permission.approve')
);

CREATE TABLE dms_permission_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  group_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('GRANT', 'REVOKE', 'ADD_MEMBER', 'REMOVE_MEMBER')),
  permission text,
  user_id uuid,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  proposed_by uuid NOT NULL,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text,
  CONSTRAINT dms_perm_req_group_fk FOREIGN KEY (group_id, tenant_id) REFERENCES dms_permission_groups (id, tenant_id),
  CONSTRAINT dms_perm_req_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id),
  CONSTRAINT dms_perm_req_target_chk CHECK (
    (kind IN ('GRANT', 'REVOKE') AND permission IS NOT NULL AND user_id IS NULL)
    OR (kind IN ('ADD_MEMBER', 'REMOVE_MEMBER') AND user_id IS NOT NULL AND permission IS NULL)
  ),
  CONSTRAINT dms_perm_req_permission_chk CHECK (
    permission IS NULL
    OR permission ~ '^(vibang|tongdat|xacminh|tochuc)\.(read|draft|confirm|add_document|download)\.(own|all)$'
    OR permission IN ('dms.permission.propose', 'dms.permission.approve')
  ),
  CONSTRAINT dms_perm_req_review_chk CHECK (
    (status = 'PENDING' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status <> 'PENDING' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CONSTRAINT dms_perm_req_reject_reason_chk CHECK (status <> 'REJECTED' OR btrim(coalesce(review_reason, '')) <> ''),
  CONSTRAINT dms_perm_req_no_self_review_chk CHECK (reviewed_by IS NULL OR reviewed_by <> proposed_by)
);
-- Một yêu cầu giống hệt đang chờ thì không đề xuất lại.
CREATE UNIQUE INDEX dms_perm_req_pending_uq ON dms_permission_requests
  (group_id, kind, coalesce(permission, ''), coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'PENDING';
CREATE INDEX dms_perm_req_list_idx ON dms_permission_requests (tenant_id, office_id, status, proposed_at DESC);

ALTER TABLE dms_permission_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_permission_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dms_permission_requests
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE FUNCTION dms_perm_req_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'dms_permission_requests rows cannot be deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status <> 'PENDING' THEN
    RAISE EXCEPTION 'a reviewed permission request is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id OR NEW.office_id <> OLD.office_id OR NEW.group_id <> OLD.group_id
     OR NEW.kind <> OLD.kind OR NEW.permission IS DISTINCT FROM OLD.permission OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.reason <> OLD.reason OR NEW.proposed_by <> OLD.proposed_by OR NEW.proposed_at <> OLD.proposed_at THEN
    RAISE EXCEPTION 'only the review fields of a permission request can change' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dms_perm_req_guard_trg BEFORE UPDATE OR DELETE ON dms_permission_requests FOR EACH ROW EXECUTE FUNCTION dms_perm_req_guard();
CREATE TRIGGER dms_perm_req_no_truncate BEFORE TRUNCATE ON dms_permission_requests FOR EACH STATEMENT EXECUTE FUNCTION vibang_append_only();

-- Nhóm rỗng thì vô hại: tạo nhóm cần quyền đề xuất; mọi quyền/thành viên vào nhóm phải qua yêu cầu có duyệt.
CREATE FUNCTION dms_group_create(p_tenant uuid, p_actor uuid, p_office uuid, p_name text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE new_id uuid;
BEGIN
  IF NOT dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.propose') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.group.create', false, 'PERMISSION_DENIED', p_office, NULL, NULL);
  END IF;
  IF btrim(coalesce(p_name, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.group.create', false, 'INVALID_INPUT', p_office, NULL, NULL);
  END IF;
  IF EXISTS (SELECT 1 FROM dms_permission_groups WHERE tenant_id = p_tenant AND office_id = p_office AND name = btrim(p_name)) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.group.create', false, 'GROUP_NAME_IN_USE', p_office, NULL, NULL);
  END IF;
  INSERT INTO dms_permission_groups (tenant_id, office_id, name) VALUES (p_tenant, p_office, btrim(p_name)) RETURNING id INTO new_id;
  PERFORM dms_audit_rec(p_tenant, p_office, p_actor, 'dms.group.create', 'group', new_id, '{}'::jsonb);
  RETURN vibang_audit(p_tenant, p_actor, 'dms.group.create', true, 'GROUP_CREATED', p_office, NULL, new_id::text);
END $$;

CREATE FUNCTION dms_permission_propose(p_tenant uuid, p_actor uuid, p_group uuid, p_kind text, p_permission text, p_user uuid, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE g dms_permission_groups; new_id uuid; ok boolean;
BEGIN
  SELECT * INTO g FROM dms_permission_groups WHERE id = p_group AND tenant_id = p_tenant;
  IF NOT FOUND OR NOT dms_has_permission(p_tenant, p_actor, g.office_id, 'dms.permission.propose') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.propose', false, 'GROUP_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('GRANT', 'REVOKE', 'ADD_MEMBER', 'REMOVE_MEMBER') OR btrim(coalesce(p_reason, '')) = ''
     OR (p_kind IN ('GRANT', 'REVOKE') AND (p_permission IS NULL OR p_user IS NOT NULL))
     OR (p_kind IN ('ADD_MEMBER', 'REMOVE_MEMBER') AND (p_user IS NULL OR p_permission IS NOT NULL)) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.propose', false, 'INVALID_INPUT', g.office_id, NULL, NULL);
  END IF;
  IF p_kind IN ('GRANT', 'REVOKE') AND NOT (
       p_permission ~ '^(vibang|tongdat|xacminh|tochuc)\.(read|draft|confirm|add_document|download)\.(own|all)$'
       OR p_permission IN ('dms.permission.propose', 'dms.permission.approve')) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.propose', false, 'UNKNOWN_PERMISSION', g.office_id, NULL, NULL);
  END IF;
  IF p_kind IN ('ADD_MEMBER', 'REMOVE_MEMBER') AND NOT EXISTS (SELECT 1 FROM users WHERE id = p_user AND tenant_id = p_tenant) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.propose', false, 'USER_NOT_FOUND', g.office_id, NULL, NULL);
  END IF;
  -- Trạng thái hiện tại phải khớp để yêu cầu có nghĩa.
  ok := CASE p_kind
    WHEN 'GRANT' THEN NOT EXISTS (SELECT 1 FROM dms_group_permissions WHERE group_id = p_group AND permission = p_permission)
    WHEN 'REVOKE' THEN EXISTS (SELECT 1 FROM dms_group_permissions WHERE group_id = p_group AND permission = p_permission)
    WHEN 'ADD_MEMBER' THEN NOT EXISTS (SELECT 1 FROM dms_group_members WHERE group_id = p_group AND user_id = p_user)
    ELSE EXISTS (SELECT 1 FROM dms_group_members WHERE group_id = p_group AND user_id = p_user) END;
  IF NOT ok THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.propose', false, 'NO_CHANGE', g.office_id, NULL, NULL);
  END IF;
  BEGIN
    INSERT INTO dms_permission_requests (tenant_id, office_id, group_id, kind, permission, user_id, reason, proposed_by)
    VALUES (p_tenant, g.office_id, p_group, p_kind, p_permission, p_user, btrim(p_reason), p_actor) RETURNING id INTO new_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.propose', false, 'ALREADY_PENDING', g.office_id, NULL, NULL);
  END;
  PERFORM dms_audit_rec(p_tenant, g.office_id, p_actor, 'dms.permission.propose', 'permission_request', new_id,
                        jsonb_build_object('group_id', p_group, 'kind', p_kind, 'permission', p_permission, 'user_id', p_user));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.propose', true, 'REQUEST_PROPOSED', g.office_id, NULL, new_id::text);
END $$;

-- Duyệt/từ chối. Duyệt: kiểm tra lại trạng thái, chặn mất hết người duyệt, áp dụng ngay.
CREATE FUNCTION dms_permission_review(p_tenant uuid, p_actor uuid, p_request uuid, p_approve boolean, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE r dms_permission_requests; remaining integer; still_valid boolean;
BEGIN
  SELECT * INTO r FROM dms_permission_requests WHERE id = p_request AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND OR NOT dms_has_permission(p_tenant, p_actor, r.office_id, 'dms.permission.approve') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.review', false, 'REQUEST_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  IF r.status <> 'PENDING' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.review', false, 'REQUEST_NOT_PENDING', r.office_id, NULL, p_request::text);
  END IF;
  IF r.proposed_by = p_actor THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.review', false, 'SELF_APPROVAL_NOT_ALLOWED', r.office_id, NULL, p_request::text);
  END IF;
  IF p_approve IS NULL OR (NOT p_approve AND btrim(coalesce(p_reason, '')) = '') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.review', false, 'REASON_REQUIRED', r.office_id, NULL, p_request::text);
  END IF;

  IF p_approve THEN
    still_valid := CASE r.kind
      WHEN 'GRANT' THEN NOT EXISTS (SELECT 1 FROM dms_group_permissions WHERE group_id = r.group_id AND permission = r.permission)
      WHEN 'REVOKE' THEN EXISTS (SELECT 1 FROM dms_group_permissions WHERE group_id = r.group_id AND permission = r.permission)
      WHEN 'ADD_MEMBER' THEN NOT EXISTS (SELECT 1 FROM dms_group_members WHERE group_id = r.group_id AND user_id = r.user_id)
      ELSE EXISTS (SELECT 1 FROM dms_group_members WHERE group_id = r.group_id AND user_id = r.user_id) END;
    IF NOT still_valid THEN
      RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.review', false, 'REQUEST_STALE', r.office_id, NULL, p_request::text);
    END IF;
    IF r.kind = 'REVOKE' AND r.permission = 'dms.permission.approve'
       OR r.kind = 'REMOVE_MEMBER' AND EXISTS (SELECT 1 FROM dms_group_permissions WHERE group_id = r.group_id AND permission = 'dms.permission.approve') THEN
      SELECT count(DISTINCT m.user_id)::integer INTO remaining
      FROM dms_group_members m
      JOIN dms_permission_groups g ON g.id = m.group_id AND g.tenant_id = m.tenant_id
      JOIN dms_group_permissions gp ON gp.group_id = m.group_id AND gp.tenant_id = m.tenant_id
      WHERE m.tenant_id = p_tenant AND g.office_id = r.office_id AND gp.permission = 'dms.permission.approve'
        AND NOT (r.kind = 'REVOKE' AND m.group_id = r.group_id)
        AND NOT (r.kind = 'REMOVE_MEMBER' AND m.group_id = r.group_id AND m.user_id = r.user_id);
      IF remaining = 0 THEN
        RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.review', false, 'WOULD_REMOVE_LAST_APPROVER', r.office_id, NULL, p_request::text);
      END IF;
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
  END IF;

  UPDATE dms_permission_requests
     SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END, reviewed_by = p_actor, reviewed_at = now(),
         review_reason = nullif(btrim(coalesce(p_reason, '')), '')
   WHERE id = p_request AND tenant_id = p_tenant;
  PERFORM dms_audit_rec(p_tenant, r.office_id, p_actor, 'dms.permission.review', 'permission_request', p_request,
                        jsonb_build_object('approved', p_approve, 'kind', r.kind, 'group_id', r.group_id));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.review', true,
                      CASE WHEN p_approve THEN 'REQUEST_APPROVED' ELSE 'REQUEST_REJECTED' END, r.office_id, NULL, p_request::text);
END $$;

-- Đọc: danh sách yêu cầu (cần quyền đề xuất hoặc duyệt), nhóm kèm quyền, và quyền hiệu lực của chính mình.
CREATE FUNCTION dms_list_permission_requests(p_tenant uuid, p_actor uuid, p_office uuid, p_status text)
RETURNS TABLE (id uuid, group_id uuid, kind text, permission text, user_id uuid, reason text, status text,
               proposed_by uuid, proposed_at timestamptz, reviewed_by uuid, reviewed_at timestamptz, review_reason text)
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.propose')
          OR dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve')) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.permission.list', false, 'PERMISSION_DENIED', p_office, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.permission.list', true, 'ALLOWED', p_office, NULL, p_status);
  RETURN QUERY
    SELECT r.id, r.group_id, r.kind, r.permission, r.user_id, r.reason, r.status, r.proposed_by, r.proposed_at,
           r.reviewed_by, r.reviewed_at, r.review_reason
    FROM dms_permission_requests r
    WHERE r.tenant_id = p_tenant AND r.office_id = p_office AND (p_status IS NULL OR r.status = p_status)
    ORDER BY r.proposed_at DESC, r.id;
END $$;

CREATE FUNCTION dms_list_groups(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (id uuid, name text, permissions text[], member_ids uuid[])
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
           coalesce((SELECT array_agg(m.user_id ORDER BY m.user_id) FROM dms_group_members m WHERE m.group_id = g.id), '{}')
    FROM dms_permission_groups g WHERE g.tenant_id = p_tenant AND g.office_id = p_office ORDER BY g.name;
END $$;

-- Quyền hiệu lực của chính người gọi (để UI ẩn/hiện nút; backend vẫn là nơi ép quyền).
CREATE FUNCTION dms_my_permissions(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (permission text)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT gp.permission
  FROM dms_group_members m
  JOIN dms_permission_groups g ON g.id = m.group_id AND g.tenant_id = m.tenant_id
  JOIN dms_group_permissions gp ON gp.group_id = m.group_id AND gp.tenant_id = m.tenant_id
  WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND g.office_id = p_office
  ORDER BY gp.permission;
$$;
