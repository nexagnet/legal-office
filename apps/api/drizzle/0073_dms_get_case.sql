-- DMS lát 3b: đọc MỘT hồ sơ (trang chi tiết). Chỉ đọc; quyền xem theo cùng luật dms_case_visible với danh sách.
-- Hồ sơ không thấy được trả rỗng (không phân biệt "không tồn tại" và "không có quyền", tránh lộ sự tồn tại).
CREATE FUNCTION dms_get_case(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (id uuid, office_id uuid, domain text, title text, status text, attributes jsonb, created_by uuid,
               created_at timestamptz, recorded_at timestamptz, cancelled_at timestamptz, cancel_reason text,
               document_count integer, scan_count integer)
LANGUAGE plpgsql AS $$
DECLARE c dms_case_files;
BEGIN
  SELECT * INTO c FROM dms_case_files WHERE dms_case_files.id = p_case AND tenant_id = p_tenant;
  IF NOT FOUND OR NOT dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.case.get', false, 'CASE_NOT_FOUND', NULL, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.case.get', true, 'ALLOWED', c.office_id, NULL, p_case::text);
  RETURN QUERY
    SELECT c.id, c.office_id, c.domain, c.title, c.status, c.attributes, c.created_by, c.created_at, c.recorded_at,
           c.cancelled_at, c.cancel_reason,
           (SELECT count(*)::integer FROM dms_documents d WHERE d.tenant_id = c.tenant_id AND d.case_id = c.id AND d.status <> 'CANCELLED'),
           (SELECT count(*)::integer FROM dms_document_files f JOIN dms_documents d ON d.id = f.document_id AND d.tenant_id = f.tenant_id
             WHERE f.tenant_id = c.tenant_id AND d.case_id = c.id AND d.status <> 'CANCELLED' AND f.is_scan);
END $$;
