-- DMS: quyền chi tiết CHO TỪNG TÀI KHOẢN, đặt được ngay lúc tạo (owner 2026-11-01: "set quyền chi tiết cho 1 tài khoản trong lúc tạo").
-- Cập nhật quy tắc cũ "quyền chỉ theo nhóm quyền": nhóm quyền vẫn là NỀN, nhưng Admin có thể tick/bỏ tick từng quyền nhỏ cho một người.
--   quyền hiệu lực = quyền của các nhóm đang dùng + quyền cấp riêng (GRANT) − quyền thu riêng (REVOKE).
--   * Bảng dms_user_permission_overrides: chỉ ghi thêm, không xoá, không sửa (chỉ đóng dòng một lần khi bỏ/đổi). Có người đặt, lý do, thời điểm.
--   * Chốt chặn duy nhất dms_has_permission (và dms_my_permissions cho UI) đọc thêm bảng này, nên MỌI nơi đang kiểm quyền
--     (API, tải tệp, tìm kiếm, xuất sổ, dms_case_visible/phạm vi chi nhánh...) tự thấy hiệu lực mới, không phải vá từng hàm.
--   * Chỉ Admin (dms.permission.approve) đặt; áp dụng ngay, bắt buộc lý do, có nhật ký. Không ai tự đặt cho chính mình;
--     không đặt cho vai ADMIN (đã mặc nhiên đủ quyền). Người không phải Admin vẫn chỉ đề xuất đổi NHÓM và không tự duyệt (luật cũ giữ nguyên).
--   * Quyền QUẢN TRỊ PHÂN QUYỀN (dms.permission.propose/approve, dms.amendment.approve) KHÔNG cấp/thu riêng được, chỉ theo nhóm:
--     để luật "không làm văn phòng mất người duyệt cuối cùng" vẫn chỉ cần nhìn nhóm.
--   * Phạm vi theo địa điểm đã là cấp riêng từng người (dms_branch_access); ad_member_create nhận thêm danh sách chi nhánh để cấp ngay lúc tạo.
-- Dữ liệu giả lập; nhật ký không PII.

-- ===== Danh mục quyền cho phép cấp/thu riêng =====
CREATE FUNCTION dms_user_overridable(p_code text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_code ~ '^(vibang|tongdat|xacminh|tochuc|vtden|vtdi|vtnb)\.(read|draft|confirm|add_document|download|amend_request)\.(own|all)$'
      OR p_code IN ('dms.stock.write', 'dms.legacy.import', 'dms.legacy.read', 'dms.audit.export');
$$;

-- ===== Bảng quyền riêng =====
CREATE TABLE dms_user_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  user_id uuid NOT NULL,
  permission text NOT NULL CHECK (dms_user_overridable(permission)),
  effect text NOT NULL CHECK (effect IN ('GRANT', 'REVOKE')),
  set_by uuid NOT NULL,
  set_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL CHECK (btrim(reason) <> '' AND length(reason) <= 1000),
  ended_by uuid,
  ended_at timestamptz,
  end_reason text CHECK (end_reason IS NULL OR (btrim(end_reason) <> '' AND length(end_reason) <= 1000)),
  CONSTRAINT dms_user_override_end_shape_chk CHECK ((ended_at IS NULL) = (ended_by IS NULL) AND (ended_at IS NULL) = (end_reason IS NULL)),
  CONSTRAINT dms_user_override_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id),
  CONSTRAINT dms_user_override_user_fk FOREIGN KEY (user_id, tenant_id) REFERENCES users (id, tenant_id)
);
-- Mỗi (người, quyền) chỉ có tối đa một dòng đang hiệu lực.
CREATE UNIQUE INDEX dms_user_override_active_uq ON dms_user_permission_overrides (tenant_id, office_id, user_id, permission) WHERE ended_at IS NULL;
CREATE INDEX dms_user_override_user_idx ON dms_user_permission_overrides (tenant_id, office_id, user_id) WHERE ended_at IS NULL;

ALTER TABLE dms_user_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_user_permission_overrides FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dms_user_permission_overrides
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE FUNCTION dms_user_override_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'dms_user_permission_overrides rows cannot be deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.ended_at IS NOT NULL
     OR NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id OR NEW.office_id <> OLD.office_id OR NEW.user_id <> OLD.user_id
     OR NEW.permission <> OLD.permission OR NEW.effect <> OLD.effect OR NEW.set_by <> OLD.set_by OR NEW.set_at <> OLD.set_at
     OR NEW.reason <> OLD.reason THEN
    RAISE EXCEPTION 'dms_user_permission_overrides rows are append-only; only a single end is allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dms_user_override_guard_trg BEFORE UPDATE OR DELETE ON dms_user_permission_overrides FOR EACH ROW EXECUTE FUNCTION dms_user_override_guard();
CREATE TRIGGER dms_user_override_no_truncate BEFORE TRUNCATE ON dms_user_permission_overrides FOR EACH STATEMENT EXECUTE FUNCTION vibang_append_only();

-- ===== Chốt chặn quyền: nhóm + cấp riêng − thu riêng =====
CREATE OR REPLACE FUNCTION dms_has_permission(p_tenant uuid, p_actor uuid, p_office uuid, p_code text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT NOT dms_user_suspended(p_tenant, p_actor) AND (
    EXISTS (
      SELECT 1 FROM memberships ms
      WHERE ms.tenant_id = p_tenant AND ms.user_id = p_actor AND ms.office_id = p_office AND ms.role = 'ADMIN'
    ) OR (
      NOT EXISTS (
        SELECT 1 FROM dms_user_permission_overrides o
        WHERE o.tenant_id = p_tenant AND o.user_id = p_actor AND o.office_id = p_office
          AND o.permission = p_code AND o.effect = 'REVOKE' AND o.ended_at IS NULL
      ) AND (
        EXISTS (
          SELECT 1
          FROM dms_group_members m
          JOIN dms_permission_groups g ON g.id = m.group_id AND g.tenant_id = m.tenant_id
          JOIN dms_group_permissions gp ON gp.group_id = m.group_id AND gp.tenant_id = m.tenant_id
          WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND g.office_id = p_office AND g.status = 'ACTIVE' AND gp.permission = p_code
        ) OR EXISTS (
          SELECT 1 FROM dms_user_permission_overrides o
          WHERE o.tenant_id = p_tenant AND o.user_id = p_actor AND o.office_id = p_office
            AND o.permission = p_code AND o.effect = 'GRANT' AND o.ended_at IS NULL
        )
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION dms_my_permissions(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (permission text)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT x.permission FROM (
    SELECT d || '.' || a || '.' || s AS permission
    FROM unnest(ARRAY['vibang', 'tongdat', 'xacminh', 'tochuc', 'vtden', 'vtdi', 'vtnb']) d,
         unnest(ARRAY['read', 'draft', 'confirm', 'add_document', 'download', 'amend_request']) a,
         unnest(ARRAY['own', 'all']) s
    WHERE EXISTS (SELECT 1 FROM memberships ms
                  WHERE ms.tenant_id = p_tenant AND ms.user_id = p_actor AND ms.office_id = p_office AND ms.role = 'ADMIN')
    UNION ALL
    SELECT c FROM unnest(ARRAY['dms.permission.propose', 'dms.permission.approve', 'dms.amendment.approve', 'dms.audit.export', 'dms.stock.write',
                               'dms.legacy.import', 'dms.legacy.read']) c
    WHERE EXISTS (SELECT 1 FROM memberships ms
                  WHERE ms.tenant_id = p_tenant AND ms.user_id = p_actor AND ms.office_id = p_office AND ms.role = 'ADMIN')
    UNION ALL
    SELECT gp.permission
    FROM dms_group_members m
    JOIN dms_permission_groups g ON g.id = m.group_id AND g.tenant_id = m.tenant_id
    JOIN dms_group_permissions gp ON gp.group_id = m.group_id AND gp.tenant_id = m.tenant_id
    WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND g.office_id = p_office AND g.status = 'ACTIVE'
      AND NOT EXISTS (SELECT 1 FROM dms_user_permission_overrides o
                      WHERE o.tenant_id = p_tenant AND o.user_id = p_actor AND o.office_id = p_office
                        AND o.permission = gp.permission AND o.effect = 'REVOKE' AND o.ended_at IS NULL)
    UNION ALL
    SELECT o.permission FROM dms_user_permission_overrides o
    WHERE o.tenant_id = p_tenant AND o.user_id = p_actor AND o.office_id = p_office AND o.effect = 'GRANT' AND o.ended_at IS NULL
  ) x
  WHERE NOT dms_user_suspended(p_tenant, p_actor)
  ORDER BY x.permission;
$$;

-- ===== Đặt quyền riêng: gửi TẬP QUYỀN MONG MUỐN, máy chủ tự suy ra cấp riêng / thu riêng so với nền của các nhóm =====
-- label = số dòng đổi. NO_CHANGE khi tập mong muốn đã khớp với trạng thái hiện tại.
CREATE FUNCTION dms_user_overrides_apply(p_tenant uuid, p_actor uuid, p_office uuid, p_user uuid, p_desired text[], p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE
  desired text[]; baseline text[]; target_grant text[]; target_revoke text[];
  cur record; n integer := 0; added text[] := ARRAY[]::text[]; removed text[] := ARRAY[]::text[];
BEGIN
  IF NOT dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.override', false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' OR length(p_reason) > 1000 OR p_desired IS NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.override', false, 'REASON_REQUIRED', p_office, NULL, NULL);
  END IF;
  IF p_user = p_actor THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.override', false, 'SELF_NOT_ALLOWED', p_office, NULL, p_user::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_user AND m.office_id = p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.override', false, 'USER_NOT_FOUND', p_office, NULL, NULL);
  END IF;
  IF EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_user AND m.office_id = p_office AND m.role = 'ADMIN') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.override', false, 'ADMIN_TARGET', p_office, NULL, p_user::text);
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_desired) c WHERE NOT dms_user_overridable(c)) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.override', false, 'UNKNOWN_PERMISSION', p_office, NULL, NULL);
  END IF;

  SELECT coalesce(array_agg(DISTINCT c), ARRAY[]::text[]) INTO desired FROM unnest(p_desired) c;
  -- Nền: quyền (cấp riêng được) của các nhóm đang dùng mà người này thuộc.
  SELECT coalesce(array_agg(DISTINCT gp.permission), ARRAY[]::text[]) INTO baseline
  FROM dms_group_members m
  JOIN dms_permission_groups g ON g.id = m.group_id AND g.tenant_id = m.tenant_id
  JOIN dms_group_permissions gp ON gp.group_id = m.group_id AND gp.tenant_id = m.tenant_id
  WHERE m.tenant_id = p_tenant AND m.user_id = p_user AND g.office_id = p_office AND g.status = 'ACTIVE'
    AND dms_user_overridable(gp.permission);
  SELECT coalesce(array_agg(c), ARRAY[]::text[]) INTO target_grant FROM unnest(desired) c WHERE NOT (c = ANY (baseline));
  SELECT coalesce(array_agg(c), ARRAY[]::text[]) INTO target_revoke FROM unnest(baseline) c WHERE NOT (c = ANY (desired));

  -- Đóng dòng không còn đúng (đã bỏ hoặc đổi chiều).
  FOR cur IN
    SELECT o.id, o.permission, o.effect FROM dms_user_permission_overrides o
    WHERE o.tenant_id = p_tenant AND o.office_id = p_office AND o.user_id = p_user AND o.ended_at IS NULL FOR UPDATE
  LOOP
    IF (cur.effect = 'GRANT' AND cur.permission = ANY (target_grant)) OR (cur.effect = 'REVOKE' AND cur.permission = ANY (target_revoke)) THEN
      CONTINUE;
    END IF;
    UPDATE dms_user_permission_overrides SET ended_by = p_actor, ended_at = now(), end_reason = btrim(p_reason) WHERE id = cur.id;
    n := n + 1;
    removed := removed || (cur.effect || ':' || cur.permission);
  END LOOP;
  -- Thêm dòng mới còn thiếu.
  WITH ins AS (
    INSERT INTO dms_user_permission_overrides (tenant_id, office_id, user_id, permission, effect, set_by, reason)
    SELECT p_tenant, p_office, p_user, t.c, t.e, p_actor, btrim(p_reason)
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
                        jsonb_build_object('added', to_jsonb(added), 'ended', to_jsonb(removed), 'reason', btrim(p_reason)));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.permission.override', true, 'OVERRIDES_APPLIED', p_office, NULL, n::text);
END $$;

-- ===== Danh sách (đang hiệu lực + lịch sử) cho màn Quyền hiệu lực =====
CREATE FUNCTION dms_list_user_overrides(p_tenant uuid, p_actor uuid, p_office uuid, p_user uuid DEFAULT NULL)
RETURNS TABLE (id uuid, user_id uuid, permission text, effect text, set_by uuid, set_at timestamptz, reason text,
               ended_by uuid, ended_at timestamptz, end_reason text)
LANGUAGE sql STABLE AS $$
  SELECT o.id, o.user_id, o.permission, o.effect, o.set_by, o.set_at, o.reason, o.ended_by, o.ended_at, o.end_reason
  FROM dms_user_permission_overrides o
  WHERE o.tenant_id = p_tenant AND o.office_id = p_office AND (p_user IS NULL OR o.user_id = p_user)
    AND (dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.propose')
         OR dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve'))
  ORDER BY o.set_at DESC, o.id;
$$;

-- ===== Tạo tài khoản kèm quyền chi tiết + chi nhánh trong MỘT giao dịch =====
-- Hàm cũ thành lõi; hàm mới cùng tên thêm hai tham số mặc định NULL (gọi 8 tham số như cũ vẫn chạy).
ALTER FUNCTION ad_member_create(uuid, uuid, uuid, text, text, uuid[], text, text) RENAME TO ad_member_create_core;

CREATE FUNCTION ad_member_create(p_tenant uuid, p_actor uuid, p_office uuid, p_email text, p_full_name text,
                                 p_groups uuid[], p_hash text, p_reason text,
                                 p_desired text[] DEFAULT NULL, p_branches uuid[] DEFAULT NULL)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE op vibang_op; sub vibang_op; uid uuid; b uuid; blist uuid[];
BEGIN
  IF dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve') THEN
    IF p_desired IS NOT NULL AND EXISTS (SELECT 1 FROM unnest(p_desired) c WHERE NOT dms_user_overridable(c)) THEN
      RETURN vibang_audit(p_tenant, p_actor, 'ad.member.create', false, 'UNKNOWN_PERMISSION', p_office, NULL, NULL);
    END IF;
    SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[]) INTO blist FROM unnest(coalesce(p_branches, ARRAY[]::uuid[])) x;
    IF EXISTS (SELECT 1 FROM unnest(blist) x
               WHERE NOT EXISTS (SELECT 1 FROM branches br WHERE br.id = x AND br.tenant_id = p_tenant AND br.office_id = p_office)) THEN
      RETURN vibang_audit(p_tenant, p_actor, 'ad.member.create', false, 'BRANCH_NOT_FOUND', p_office, NULL, NULL);
    END IF;
  END IF;
  op := ad_member_create_core(p_tenant, p_actor, p_office, p_email, p_full_name, p_groups, p_hash, p_reason);
  IF NOT op.ok THEN RETURN op; END IF;
  uid := op.label::uuid;
  IF p_desired IS NOT NULL THEN
    sub := dms_user_overrides_apply(p_tenant, p_actor, p_office, uid, p_desired, p_reason);
    IF NOT sub.ok AND sub.code <> 'NO_CHANGE' THEN
      RAISE EXCEPTION 'ad_member_create: cannot set permission overrides (%)', sub.code USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  FOREACH b IN ARRAY coalesce(blist, ARRAY[]::uuid[]) LOOP
    sub := dms_branch_access_set(p_tenant, p_actor, p_office, uid, b, true, p_reason);
    IF NOT sub.ok THEN
      RAISE EXCEPTION 'ad_member_create: cannot grant branch (%)', sub.code USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END LOOP;
  RETURN op;
END $$;
