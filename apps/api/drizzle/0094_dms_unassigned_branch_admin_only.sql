-- Hồ sơ chưa có chi nhánh (quyết định owner 2026-11-01): chỉ Admin thấy; Admin gắn chi nhánh xong thì người của chi nhánh đó mới thấy.
--   * Văn phòng ĐÃ có chi nhánh: hồ sơ branch_id NULL (dữ liệu trước ngày áp dụng phạm vi chi nhánh) chỉ người có quyền duyệt
--     phân quyền (Admin) thấy. Văn phòng chưa tạo chi nhánh nào: không áp dụng phạm vi, mọi người có quyền vẫn thấy như cũ.
--   * Gắn chi nhánh cho hồ sơ chưa có chi nhánh: chỉ Admin, chỉ đi từ NULL sang một chi nhánh của đúng văn phòng, MỘT LẦN
--     (đã có chi nhánh thì không đổi, kể cả Admin), kể cả hồ sơ đã ghi sổ. Ngoài cột branch_id không đổi gì khác. Có nhật ký.
-- Dữ liệu giả lập.

-- Hồ sơ đã ghi sổ vẫn bất biến, trừ đúng một bước: branch_id từ NULL sang có giá trị (mọi cột khác giữ nguyên).
DO $do$
DECLARE def text; patched text;
BEGIN
  def := pg_get_functiondef('dms_draft_guard()'::regprocedure);
  patched := replace(def,
    'IF OLD.status <> ''DRAFT'' THEN
    RAISE EXCEPTION',
    'IF OLD.status <> ''DRAFT'' THEN
    IF TG_TABLE_NAME = ''dms_case_files'' THEN
      IF (to_jsonb(OLD) ->> ''branch_id'') IS NULL AND (to_jsonb(NEW) ->> ''branch_id'') IS NOT NULL
         AND (to_jsonb(NEW) - ''branch_id'') = (to_jsonb(OLD) - ''branch_id'') THEN
        RETURN NEW;
      END IF;
    END IF;
    RAISE EXCEPTION');
  IF patched = def THEN RAISE EXCEPTION 'dms_draft_guard: pattern not found'; END IF;
  EXECUTE patched;
END $do$;

CREATE OR REPLACE FUNCTION dms_user_in_branch(p_tenant uuid, p_actor uuid, p_office uuid, p_branch uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p_branch IS NULL THEN
      NOT EXISTS (SELECT 1 FROM branches b WHERE b.tenant_id = p_tenant AND b.office_id = p_office)
      OR (NOT dms_user_suspended(p_tenant, p_actor) AND dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve'))
    ELSE NOT dms_user_suspended(p_tenant, p_actor) AND EXISTS (
      SELECT 1 FROM dms_branch_ids(p_tenant, p_actor, p_office) i WHERE i = p_branch)
  END
$$;

-- Admin gắn chi nhánh cho nhiều hồ sơ cùng lúc: được tất cả hoặc không gì cả.
CREATE FUNCTION dms_cases_assign_branch(p_tenant uuid, p_actor uuid, p_office uuid, p_cases uuid[], p_branch uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE n integer; cid uuid;
BEGIN
  IF NOT dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.case.assign_branch', false, 'ADMIN_ONLY', p_office, NULL, NULL);
  END IF;
  IF p_cases IS NULL OR cardinality(p_cases) = 0 OR cardinality(p_cases) > 500 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.case.assign_branch', false, 'INVALID_INPUT', p_office, NULL, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = p_branch AND b.tenant_id = p_tenant AND b.office_id = p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.case.assign_branch', false, 'BRANCH_NOT_FOUND', p_office, NULL, NULL);
  END IF;
  SELECT count(*) INTO n FROM dms_case_files c
   WHERE c.tenant_id = p_tenant AND c.office_id = p_office AND c.id = ANY (p_cases) AND c.branch_id IS NULL;
  IF n <> (SELECT count(DISTINCT x) FROM unnest(p_cases) x) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ad.case.assign_branch', false, 'CASE_NOT_UNASSIGNED', p_office, p_branch, NULL);
  END IF;
  FOR cid IN SELECT DISTINCT x FROM unnest(p_cases) x LOOP
    UPDATE dms_case_files SET branch_id = p_branch WHERE id = cid AND tenant_id = p_tenant;
    PERFORM dms_audit_rec(p_tenant, p_office, p_actor, 'dms.case.set_branch', 'case', cid,
                          jsonb_build_object('branch', p_branch, 'by', 'ADMIN_BACKFILL'));
  END LOOP;
  RETURN vibang_audit(p_tenant, p_actor, 'ad.case.assign_branch', true, 'BRANCH_ASSIGNED', p_office, p_branch, n::text);
END $$;

-- Hồ sơ chưa có chi nhánh của văn phòng (chỉ Admin; văn phòng chưa có chi nhánh thì rỗng vì không áp dụng phạm vi).
CREATE FUNCTION dms_cases_without_branch(p_tenant uuid, p_actor uuid, p_office uuid, p_limit integer DEFAULT 200)
RETURNS TABLE (id uuid, domain text, title text, status text, created_at timestamptz) LANGUAGE plpgsql AS $$
BEGIN
  IF NOT dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve')
     OR NOT EXISTS (SELECT 1 FROM branches b WHERE b.tenant_id = p_tenant AND b.office_id = p_office) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT c.id, c.domain, c.title, c.status, c.created_at FROM dms_case_files c
    WHERE c.tenant_id = p_tenant AND c.office_id = p_office AND c.branch_id IS NULL AND c.status <> 'CANCELLED'
    ORDER BY c.created_at DESC, c.id LIMIT greatest(1, least(coalesce(p_limit, 200), 500));
END $$;

CREATE FUNCTION dms_cases_without_branch_count(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN dms_has_permission(p_tenant, p_actor, p_office, 'dms.permission.approve')
                AND EXISTS (SELECT 1 FROM branches b WHERE b.tenant_id = p_tenant AND b.office_id = p_office)
         THEN (SELECT count(*) FROM dms_case_files c WHERE c.tenant_id = p_tenant AND c.office_id = p_office
                 AND c.branch_id IS NULL AND c.status <> 'CANCELLED')
         ELSE 0 END
$$;
