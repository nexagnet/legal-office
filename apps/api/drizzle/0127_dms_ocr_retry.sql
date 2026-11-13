-- Thử lại OCR cho tệp tài liệu MỚI mà OCR đã lỗi (FAILED, hết 3 lần tự thử). Chỉ đặt lại hàng đợi OCR (văn bản nhận dạng chỉ để tìm kiếm);
-- tệp, phiên bản và hồ sơ không bị đụng tới nên không phá tính bất biến. Quyền: cùng quyền thêm tài liệu của nghiệp vụ (add_document),
-- không thêm mã quyền mới. Chỉ phiên bản MỚI NHẤT của tệp chưa xóa; trạng thái khác FAILED thì từ chối, không đặt lại việc đang chạy.
CREATE FUNCTION dms_ocr_retry(p_tenant uuid, p_actor uuid, p_file uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE d dms_documents; f dms_document_files; l record; c dms_case_files; vid uuid; n integer;
BEGIN
  SELECT * INTO f FROM dms_document_files WHERE id = p_file AND tenant_id = p_tenant AND deleted_at IS NULL;
  IF FOUND THEN SELECT * INTO d FROM dms_documents WHERE id = f.document_id AND tenant_id = p_tenant; END IF;
  IF NOT FOUND THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.ocr.retry', false, 'FILE_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  SELECT * INTO l FROM dms_case_load(p_tenant, p_actor, d.case_id, 'dms.ocr.retry', 'add_document');
  IF l.denied IS NOT NULL THEN RETURN ROW(false, CASE WHEN l.denied = 'CASE_NOT_FOUND' THEN 'FILE_NOT_FOUND' ELSE l.denied END, NULL)::vibang_op; END IF;
  c := l.c;
  SELECT v.id INTO vid FROM dms_document_versions v
  WHERE v.tenant_id = p_tenant AND v.file_id = p_file ORDER BY v.version DESC LIMIT 1;
  UPDATE dms_ocr_results
  SET status = 'PENDING', attempts = 0, error = NULL, finished_at = NULL, claimed_at = NULL, pages_done = NULL, pages_total = NULL
  WHERE tenant_id = p_tenant AND version_id = vid AND status = 'FAILED';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.ocr.retry', false, 'OCR_NOT_FAILED', c.office_id, NULL, p_file::text);
  END IF;
  PERFORM dms_audit_rec(p_tenant, c.office_id, p_actor, 'dms.ocr.retry', 'file', p_file, jsonb_build_object('version_id', vid));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.ocr.retry', true, 'OCR_RETRY_QUEUED', c.office_id, NULL, p_file::text);
END $$;
