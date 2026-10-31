-- DMS lát 5b: danh sách tài liệu trả thêm `attributes` để form nhập cột sổ (S-01) hiện giá trị đã lưu. Chỉ đọc.
DROP FUNCTION dms_list_documents(uuid, uuid, uuid);
CREATE FUNCTION dms_list_documents(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (id uuid, kind text, title text, is_official boolean, status text, created_by uuid, created_at timestamptz,
               file_count integer, scan_count integer, attributes jsonb)
LANGUAGE plpgsql AS $$
DECLARE c dms_case_files;
BEGIN
  SELECT * INTO c FROM dms_case_files WHERE dms_case_files.id = p_case AND tenant_id = p_tenant;
  IF NOT FOUND OR NOT dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.document.list', false, 'CASE_NOT_FOUND', NULL, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.document.list', true, 'ALLOWED', c.office_id, NULL, p_case::text);
  RETURN QUERY
    SELECT d.id, d.kind, d.title, d.is_official, d.status, d.created_by, d.created_at,
           (SELECT count(*)::integer FROM dms_document_files f WHERE f.tenant_id = d.tenant_id AND f.document_id = d.id),
           (SELECT count(*)::integer FROM dms_document_files f WHERE f.tenant_id = d.tenant_id AND f.document_id = d.id AND f.is_scan),
           d.attributes
    FROM dms_documents d
    WHERE d.tenant_id = p_tenant AND d.case_id = p_case AND d.status <> 'CANCELLED'
    ORDER BY d.created_at, d.id;
END $$;
