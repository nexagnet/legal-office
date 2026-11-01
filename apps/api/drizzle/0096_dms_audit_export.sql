-- "Xuất bản sao" nhật ký phân quyền (Figma P10): QUYỀN RIÊNG `dms.audit.export`, và chính việc xuất cũng được ghi lại.
--   * Admin mặc nhiên có (dms_has_permission cho vai ADMIN mọi mã). Nhóm khác chỉ có khi được cấp; không sao chép sang nhóm mới
--     khi "Sao chép nhóm" (giống quyền quản trị phân quyền).
--   * dms_audit_export_log: kiểm quyền, GHI dòng nhật ký `dms.audit.export` (ai, lúc nào, bao nhiêu dòng) rồi mới cho lấy dữ liệu.
--     Bị từ chối cũng ghi (PERMISSION_DENIED) ở nhật ký nghiệp vụ.
--   * dms_audit_export_rows: chỉ đọc, kiểm quyền lần nữa; trả đủ cột (kể cả tên người/nhóm) để bản sao đọc được khi đứng riêng.
-- Dữ liệu giả lập.

ALTER TABLE dms_group_permissions DROP CONSTRAINT dms_group_permissions_permission_check;
ALTER TABLE dms_group_permissions ADD CONSTRAINT dms_group_permissions_permission_check CHECK (
  permission ~ '^(vibang|tongdat|xacminh|tochuc|vtden|vtdi|vtnb)\.(read|draft|confirm|add_document|download|amend_request)\.(own|all)$'
  OR permission IN ('dms.permission.propose', 'dms.permission.approve', 'dms.amendment.approve', 'dms.stock.write', 'dms.legacy.import', 'dms.legacy.read', 'dms.audit.export')
);
ALTER TABLE dms_permission_requests DROP CONSTRAINT dms_perm_req_permission_chk;
ALTER TABLE dms_permission_requests ADD CONSTRAINT dms_perm_req_permission_chk CHECK (
  permission IS NULL
  OR permission ~ '^(vibang|tongdat|xacminh|tochuc|vtden|vtdi|vtnb)\.(read|draft|confirm|add_document|download|amend_request)\.(own|all)$'
  OR permission IN ('dms.permission.propose', 'dms.permission.approve', 'dms.amendment.approve', 'dms.stock.write', 'dms.legacy.import', 'dms.legacy.read', 'dms.audit.export')
);

DO $do$
DECLARE
  edits text[][] := ARRAY[
    ARRAY['dms_permission_propose', $q$'dms.permission.approve', 'dms.amendment.approve', 'dms.stock.write'$q$, $q$'dms.permission.approve', 'dms.amendment.approve', 'dms.audit.export', 'dms.stock.write'$q$],
    ARRAY['dms_my_permissions', $q$'dms.permission.approve', 'dms.amendment.approve', 'dms.stock.write'$q$, $q$'dms.permission.approve', 'dms.amendment.approve', 'dms.audit.export', 'dms.stock.write'$q$],
    ARRAY['dms_group_copy', $q$gp.permission <> 'dms.amendment.approve'$q$, $q$gp.permission NOT IN ('dms.amendment.approve', 'dms.audit.export')$q$]
  ];
  i integer; r record; def text; patched text;
BEGIN
  FOR i IN 1 .. array_length(edits, 1) LOOP
    SELECT p.oid INTO r FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = current_schema() AND p.proname = edits[i][1];
    def := pg_get_functiondef(r.oid);
    patched := replace(def, edits[i][2], edits[i][3]);
    IF patched = def THEN RAISE EXCEPTION '0096: % không có gì để vá (%)', edits[i][1], edits[i][2]; END IF;
    EXECUTE patched;
  END LOOP;
END $do$;

CREATE FUNCTION dms_audit_export_log(p_tenant uuid, p_actor uuid, p_office uuid, p_format text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  IF NOT dms_has_permission(p_tenant, p_actor, p_office, 'dms.audit.export') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.audit.export', false, 'PERMISSION_DENIED', p_office, NULL, NULL);
  END IF;
  IF p_format IS NULL OR p_format NOT IN ('xlsx') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.audit.export', false, 'INVALID_INPUT', p_office, NULL, NULL);
  END IF;
  SELECT count(*) INTO n FROM dms_permission_requests r WHERE r.tenant_id = p_tenant AND r.office_id = p_office;
  PERFORM dms_audit_rec(p_tenant, p_office, p_actor, 'dms.audit.export', 'office', p_office,
                        jsonb_build_object('log', 'permission', 'format', p_format, 'rows', n));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.audit.export', true, 'AUDIT_EXPORTED', p_office, NULL, n::text);
END $$;

CREATE FUNCTION dms_audit_export_rows(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (id uuid, kind text, group_name text, permission text, target_label text, reason text, status text, auto_applied boolean,
               proposed_by_label text, proposed_at timestamptz, reviewed_by_label text, reviewed_at timestamptz, review_reason text)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF NOT dms_has_permission(p_tenant, p_actor, p_office, 'dms.audit.export') THEN RETURN; END IF;
  RETURN QUERY
    SELECT r.id, r.kind, g.name, r.permission,
           (SELECT ad_user_label(u.full_name, ac.email, u.external_ref) FROM users u
              LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id
             WHERE u.id = r.user_id AND u.tenant_id = r.tenant_id),
           r.reason, r.status, r.auto_applied,
           (SELECT ad_user_label(u.full_name, ac.email, u.external_ref) FROM users u
              LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id
             WHERE u.id = r.proposed_by AND u.tenant_id = r.tenant_id),
           r.proposed_at,
           (SELECT ad_user_label(u.full_name, ac.email, u.external_ref) FROM users u
              LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id
             WHERE u.id = r.reviewed_by AND u.tenant_id = r.tenant_id),
           r.reviewed_at, r.review_reason
    FROM dms_permission_requests r
    JOIN dms_permission_groups g ON g.id = r.group_id AND g.tenant_id = r.tenant_id
    WHERE r.tenant_id = p_tenant AND r.office_id = p_office
    ORDER BY r.proposed_at DESC, r.id;
END $$;
