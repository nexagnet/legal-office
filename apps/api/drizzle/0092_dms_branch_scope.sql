-- Phạm vi theo địa điểm (quyết định owner 2026-11-01): người dùng chỉ thấy hồ sơ và bản ghi của chi nhánh được cấp,
-- kể cả Văn thư xem sổ. Một chốt chặn duy nhất: dms_case_visible (mọi danh sách, sổ, báo cáo, tìm OCR, tải tệp, sửa đổi đều đi qua).
--   * dms_case_files.branch_id: chi nhánh của hồ sơ, đặt MỘT LẦN lúc tạo nháp rồi bất biến (không có chỗ sửa trực tiếp).
--   * dms_branch_access: cấp / thu hồi chi nhánh cho người dùng (nhóm quyền chỉ nói "làm được gì", bảng này nói "ở đâu").
--     Chỉ người có quyền duyệt phân quyền (Admin) cấp/thu hồi, áp dụng ngay, lý do bắt buộc, giữ lịch sử, không xoá.
--     Các cấp phát cũ trong branch_grants (mô hình theo vai) vẫn được tính, để không ai mất quyền xem bất ngờ.
--   * Người có quyền duyệt phân quyền (Admin) thấy mọi chi nhánh của văn phòng.
--   * Hồ sơ cũ chưa có chi nhánh (branch_id NULL) giữ hành vi hiện tại: ai có quyền xem thì thấy. Không có đường sửa chi nhánh
--     của hồ sơ đã tạo (bất biến), nên đây là tồn tại có chủ ý của dữ liệu trước ngày áp dụng.
--   * Tạo nháp: văn phòng có chi nhánh thì hồ sơ mới BẮT BUỘC thuộc một chi nhánh người tạo được cấp (1 chi nhánh thì tự chọn,
--     nhiều thì phải chọn: BRANCH_REQUIRED; chưa được cấp: BRANCH_NOT_GRANTED). Văn phòng chưa tạo chi nhánh nào: không áp dụng.
--   * Người được chỉ định xác nhận THV (dms_thv_confirm) không bị phạm vi chi nhánh chặn: họ phải xác nhận việc của chính họ.
-- Dữ liệu giả lập.

CREATE TABLE dms_branch_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  user_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  grant_reason text NOT NULL CHECK (btrim(grant_reason) <> '' AND length(grant_reason) <= 1000),
  revoked_by uuid,
  revoked_at timestamptz,
  revoke_reason text CHECK (revoke_reason IS NULL OR (btrim(revoke_reason) <> '' AND length(revoke_reason) <= 1000)),
  CONSTRAINT dms_branch_access_revoke_shape_chk CHECK ((revoked_at IS NULL) = (revoked_by IS NULL) AND (revoked_at IS NULL) = (revoke_reason IS NULL)),
  CONSTRAINT dms_branch_access_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id),
  CONSTRAINT dms_branch_access_user_fk FOREIGN KEY (user_id, tenant_id) REFERENCES users (id, tenant_id),
  CONSTRAINT dms_branch_access_branch_fk FOREIGN KEY (branch_id, tenant_id) REFERENCES branches (id, tenant_id)
);
CREATE UNIQUE INDEX dms_branch_access_active_uq ON dms_branch_access (tenant_id, user_id, branch_id) WHERE revoked_at IS NULL;
CREATE INDEX dms_branch_access_user_idx ON dms_branch_access (tenant_id, office_id, user_id);

ALTER TABLE dms_branch_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_branch_access FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dms_branch_access
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- Không xoá; không sửa gì ngoài việc đóng dòng (thu hồi) một lần.
CREATE FUNCTION dms_branch_access_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'dms_branch_access rows cannot be deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.revoked_at IS NOT NULL
     OR NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id OR NEW.office_id <> OLD.office_id OR NEW.user_id <> OLD.user_id
     OR NEW.branch_id <> OLD.branch_id OR NEW.granted_by <> OLD.granted_by OR NEW.granted_at <> OLD.granted_at
     OR NEW.grant_reason <> OLD.grant_reason THEN
    RAISE EXCEPTION 'dms_branch_access rows are append-only; only a single revoke is allowed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER dms_branch_access_guard_trg BEFORE UPDATE OR DELETE ON dms_branch_access FOR EACH ROW EXECUTE FUNCTION dms_branch_access_guard();
CREATE TRIGGER dms_branch_access_no_truncate BEFORE TRUNCATE ON dms_branch_access FOR EACH STATEMENT EXECUTE FUNCTION vibang_append_only();

-- Chi nhánh của hồ sơ.
ALTER TABLE dms_case_files
  ADD COLUMN branch_id uuid,
  ADD CONSTRAINT dms_case_files_branch_fk FOREIGN KEY (branch_id, tenant_id) REFERENCES branches (id, tenant_id);
CREATE INDEX dms_case_files_branch_idx ON dms_case_files (tenant_id, office_id, branch_id);

-- Chi nhánh của hồ sơ đã đặt thì không đổi (nháp hay không).
DO $do$
DECLARE def text; patched text;
BEGIN
  def := pg_get_functiondef('dms_draft_guard()'::regprocedure);
  patched := replace(def, 'IF NEW.office_id <> OLD.office_id OR NEW.domain <> OLD.domain THEN',
                          'IF NEW.office_id <> OLD.office_id OR NEW.domain <> OLD.domain OR (OLD.branch_id IS NOT NULL AND NEW.branch_id IS DISTINCT FROM OLD.branch_id) THEN');
  IF patched = def THEN RAISE EXCEPTION 'dms_draft_guard: pattern not found'; END IF;
  EXECUTE patched;
END $do$;

-- Các chi nhánh mà người dùng được xem trong một văn phòng. Người duyệt phân quyền (Admin) = mọi chi nhánh.
CREATE FUNCTION dms_branch_ids(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE AS $$
  SELECT b.id FROM branches b
  WHERE b.tenant_id = p_tenant AND b.office_id = p_office AND NOT dms_user_suspended(p_tenant, p_actor)
    AND (
      dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve')
      OR EXISTS (SELECT 1 FROM dms_branch_access a
                 WHERE a.tenant_id = p_tenant AND a.user_id = p_actor AND a.branch_id = b.id AND a.revoked_at IS NULL)
      OR EXISTS (SELECT 1 FROM branch_grants g JOIN memberships m ON m.id = g.membership_id AND m.tenant_id = g.tenant_id
                 WHERE g.tenant_id = p_tenant AND g.branch_id = b.id AND m.user_id = p_actor AND m.office_id = p_office)
    )
$$;

-- NULL (hồ sơ cũ chưa có chi nhánh) = không giới hạn theo chi nhánh.
CREATE FUNCTION dms_user_in_branch(p_tenant uuid, p_actor uuid, p_office uuid, p_branch uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_branch IS NULL OR NOT dms_user_suspended(p_tenant, p_actor) AND EXISTS (
    SELECT 1 FROM dms_branch_ids(p_tenant, p_actor, p_office) i WHERE i = p_branch)
$$;

-- Chốt chặn thấy/không thấy hồ sơ: luật cũ VÀ đúng chi nhánh. Thêm tham số thứ 7 (mặc định NULL), thay bản 6 tham số.
DROP FUNCTION dms_case_visible(uuid, uuid, uuid, text, text, uuid);
CREATE FUNCTION dms_case_visible(p_tenant uuid, p_actor uuid, p_office uuid, p_domain text, p_status text, p_created_by uuid, p_branch uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN p_status = 'RECORDED' THEN dms_authorize(p_tenant, p_actor, p_office, p_domain, 'read', p_created_by) IS NULL
              ELSE p_created_by = p_actor
                   AND (dms_has_permission(p_tenant, p_actor, p_office, p_domain || '.read.own')
                     OR dms_has_permission(p_tenant, p_actor, p_office, p_domain || '.read.all')) END
         AND dms_user_in_branch(p_tenant, p_actor, p_office, p_branch);
$$;

-- Mọi hàm đang gọi dms_case_visible truyền thêm c.branch_id (danh sách, chi tiết, sổ, báo cáo, tìm OCR, tải tệp, sửa đổi...).
DO $do$
DECLARE r record; def text; patched text; n integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = current_schema() AND p.prokind = 'f' AND p.proname <> 'dms_case_visible'
      AND p.prosrc ~ 'dms_case_visible\('
  LOOP
    def := pg_get_functiondef(r.oid);
    patched := regexp_replace(def, '(dms_case_visible\([^()]*c\.created_by)\)', '\1, c.branch_id)', 'g');
    IF patched = def THEN RAISE EXCEPTION 'dms_case_visible caller % not patched', r.proname; END IF;
    EXECUTE patched;
    n := n + 1;
  END LOOP;
  IF n = 0 THEN RAISE EXCEPTION 'no dms_case_visible callers found'; END IF;
END $do$;

-- Tạo nháp: giữ nguyên hàm cũ làm phần lõi, bọc thêm việc chọn/kiểm tra chi nhánh.
ALTER FUNCTION dms_case_create_draft(uuid, uuid, uuid, text, text, jsonb) RENAME TO dms_case_create_draft_core;

CREATE FUNCTION dms_case_create_draft(p_tenant uuid, p_actor uuid, p_office uuid, p_domain text, p_title text, p_attributes jsonb, p_branch uuid DEFAULT NULL)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE chosen uuid := p_branch; ids uuid[]; r vibang_op; has_branches boolean;
BEGIN
  -- Không đủ quyền tạo nháp / dữ liệu sai: để hàm lõi trả đúng mã như trước, không lộ gì về chi nhánh.
  IF dms_authorize(p_tenant, p_actor, p_office, p_domain, 'draft', p_actor) IS NOT NULL THEN
    RETURN dms_case_create_draft_core(p_tenant, p_actor, p_office, p_domain, p_title, p_attributes);
  END IF;
  SELECT EXISTS (SELECT 1 FROM branches b WHERE b.tenant_id = p_tenant AND b.office_id = p_office) INTO has_branches;
  IF p_branch IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = p_branch AND b.tenant_id = p_tenant AND b.office_id = p_office) THEN
      RETURN vibang_audit(p_tenant, p_actor, 'dms.case.create', false, 'BRANCH_NOT_FOUND', p_office, NULL, p_domain);
    END IF;
    IF NOT dms_user_in_branch(p_tenant, p_actor, p_office, p_branch) THEN
      RETURN vibang_audit(p_tenant, p_actor, 'dms.case.create', false, 'BRANCH_NOT_GRANTED', p_office, p_branch, p_domain);
    END IF;
  ELSIF has_branches THEN
    SELECT array_agg(i) INTO ids FROM dms_branch_ids(p_tenant, p_actor, p_office) i;
    IF ids IS NULL THEN
      RETURN vibang_audit(p_tenant, p_actor, 'dms.case.create', false, 'BRANCH_NOT_GRANTED', p_office, NULL, p_domain);
    ELSIF cardinality(ids) = 1 THEN
      chosen := ids[1];
    ELSE
      RETURN vibang_audit(p_tenant, p_actor, 'dms.case.create', false, 'BRANCH_REQUIRED', p_office, NULL, p_domain);
    END IF;
  END IF;
  r := dms_case_create_draft_core(p_tenant, p_actor, p_office, p_domain, p_title, p_attributes);
  IF r.ok AND chosen IS NOT NULL THEN
    UPDATE dms_case_files SET branch_id = chosen WHERE id = r.label::uuid AND tenant_id = p_tenant;
    PERFORM dms_audit_rec(p_tenant, p_office, p_actor, 'dms.case.set_branch', 'case', r.label::uuid, jsonb_build_object('branch', chosen));
  END IF;
  RETURN r;
END $$;

-- Cấp / thu hồi chi nhánh. Người duyệt phân quyền thực hiện, áp dụng ngay, lý do bắt buộc, có nhật ký.
CREATE FUNCTION dms_branch_access_set(p_tenant uuid, p_actor uuid, p_office uuid, p_user uuid, p_branch uuid, p_grant boolean, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE act text := CASE WHEN p_grant THEN 'ad.branch_access.grant' ELSE 'ad.branch_access.revoke' END; row_id uuid;
BEGIN
  IF NOT dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve') THEN
    RETURN vibang_audit(p_tenant, p_actor, act, false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  IF p_grant IS NULL OR btrim(coalesce(p_reason, '')) = '' OR length(p_reason) > 1000 THEN
    RETURN vibang_audit(p_tenant, p_actor, act, false, 'REASON_REQUIRED', p_office, NULL, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_user AND m.office_id = p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, act, false, 'USER_NOT_FOUND', p_office, NULL, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = p_branch AND b.tenant_id = p_tenant AND b.office_id = p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, act, false, 'BRANCH_NOT_FOUND', p_office, NULL, NULL);
  END IF;
  SELECT a.id INTO row_id FROM dms_branch_access a
   WHERE a.tenant_id = p_tenant AND a.user_id = p_user AND a.branch_id = p_branch AND a.revoked_at IS NULL FOR UPDATE;
  IF p_grant THEN
    IF row_id IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, act, false, 'NO_CHANGE', p_office, p_branch, p_user::text); END IF;
    INSERT INTO dms_branch_access (tenant_id, office_id, user_id, branch_id, granted_by, grant_reason)
    VALUES (p_tenant, p_office, p_user, p_branch, p_actor, btrim(p_reason));
  ELSE
    IF row_id IS NULL THEN RETURN vibang_audit(p_tenant, p_actor, act, false, 'NO_CHANGE', p_office, p_branch, p_user::text); END IF;
    UPDATE dms_branch_access SET revoked_by = p_actor, revoked_at = now(), revoke_reason = btrim(p_reason) WHERE id = row_id;
  END IF;
  PERFORM dms_audit_rec(p_tenant, p_office, p_actor, act, 'user', p_user, jsonb_build_object('branch', p_branch, 'reason', btrim(p_reason)));
  RETURN vibang_audit(p_tenant, p_actor, act, true, CASE WHEN p_grant THEN 'BRANCH_ACCESS_GRANTED' ELSE 'BRANCH_ACCESS_REVOKED' END,
                      p_office, p_branch, p_user::text);
END $$;

-- Ai đang được xem chi nhánh nào (nguồn DMS: thu hồi được tại đây; nguồn LEGACY: cấp phát cũ theo vai, chỉ hiển thị).
CREATE FUNCTION dms_branch_access_list(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (user_id uuid, branch_id uuid, branch_name text, source text) LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve')
          OR dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.propose')) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT a.user_id, a.branch_id, b.name, 'DMS'::text
    FROM dms_branch_access a JOIN branches b ON b.id = a.branch_id AND b.tenant_id = a.tenant_id
    WHERE a.tenant_id = p_tenant AND a.office_id = p_office AND a.revoked_at IS NULL
    UNION ALL
    SELECT m.user_id, g.branch_id, b.name, 'LEGACY'::text
    FROM branch_grants g
    JOIN memberships m ON m.id = g.membership_id AND m.tenant_id = g.tenant_id
    JOIN branches b ON b.id = g.branch_id AND b.tenant_id = g.tenant_id
    WHERE g.tenant_id = p_tenant AND m.office_id = p_office
    ORDER BY 4, 3, 1;
END $$;

-- Chi nhánh của chính tôi (để form tạo hồ sơ biết chọn gì).
CREATE FUNCTION dms_my_branches(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (branch_id uuid, branch_name text) LANGUAGE sql STABLE AS $$
  SELECT b.id, b.name FROM branches b
  WHERE b.tenant_id = p_tenant AND b.id IN (SELECT dms_branch_ids(p_tenant, p_actor, p_office))
  ORDER BY b.name
$$;

-- Danh sách thành viên: cột chi nhánh gồm cả chi nhánh cấp theo mô hình mới.
DO $do$
DECLARE def text; patched text;
BEGIN
  def := pg_get_functiondef('of_search_members(uuid, uuid, uuid)'::regprocedure);
  patched := replace(def,
    $q$coalesce((SELECT array_agg(b.name ORDER BY b.name) FROM branch_grants g
                     JOIN branches b ON b.id = g.branch_id AND b.tenant_id = g.tenant_id
                     WHERE g.membership_id = m.id AND g.tenant_id = p_tenant), ARRAY[]::text[])$q$,
    $q$coalesce((SELECT array_agg(DISTINCT b.name ORDER BY b.name) FROM branches b
                     WHERE b.tenant_id = p_tenant AND b.id IN (
                       SELECT g.branch_id FROM branch_grants g WHERE g.membership_id = m.id AND g.tenant_id = p_tenant
                       UNION
                       SELECT a.branch_id FROM dms_branch_access a
                       WHERE a.tenant_id = p_tenant AND a.user_id = m.user_id AND a.office_id = p_office AND a.revoked_at IS NULL)),
                   ARRAY[]::text[])$q$);
  IF patched = def THEN RAISE EXCEPTION 'of_search_members: pattern not found'; END IF;
  EXECUTE patched;
END $do$;
