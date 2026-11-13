-- Tiến độ OCR của tệp tài liệu MỚI (không áp dụng cho tài liệu cũ/legacy): số trang đã OCR / tổng số trang.
-- Worker báo tiến độ sau mỗi trang qua dms_ocr_progress; giao diện chỉ đọc qua dms_ocr_status (không ghi nhật ký, để polling nhẹ).
ALTER TABLE dms_ocr_results ADD COLUMN pages_done integer;
ALTER TABLE dms_ocr_results ADD COLUMN pages_total integer;

-- Vá hàm hiện hành (cùng cách vá ở 0105): thay đúng đoạn, báo lỗi nếu không khớp thay vì âm thầm bỏ sót.
CREATE FUNCTION dms_tmp_patch_0124(p_name text, p_old text, p_new text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record; def text; patched text; n integer := 0;
BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
            WHERE ns.nspname = current_schema() AND p.proname = p_name AND p.prokind = 'f' LOOP
    def := pg_get_functiondef(r.oid);
    patched := replace(def, p_old, p_new);
    IF patched = def THEN RAISE EXCEPTION '0124: % không có gì để vá (%)', p_name, p_old; END IF;
    EXECUTE patched;
    n := n + 1;
  END LOOP;
  IF n = 0 THEN RAISE EXCEPTION '0124: không tìm thấy hàm %', p_name; END IF;
END $$;

-- Mỗi lần nhận việc (kể cả thử lại) bắt đầu lại từ 0 trang; tổng trang chưa biết cho tới khi worker đếm xong.
SELECT dms_tmp_patch_0124('dms_ocr_claim',
  'claimed_at = now(), attempts = r.attempts + 1, error = NULL',
  'claimed_at = now(), attempts = r.attempts + 1, error = NULL, pages_done = 0, pages_total = NULL');
-- Xong: đủ số trang.
SELECT dms_tmp_patch_0124('dms_ocr_complete',
  'page_count = p_pages,',
  'page_count = p_pages, pages_done = p_pages, pages_total = p_pages,');
DROP FUNCTION dms_tmp_patch_0124(text, text, text);

-- Worker báo tiến độ (chỉ khi dòng đang RUNNING). Số trang bị kẹp để done <= total, không bao giờ âm.
CREATE FUNCTION dms_ocr_progress(p_tenant uuid, p_id uuid, p_done integer, p_total integer)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  UPDATE dms_ocr_results
  SET pages_total = greatest(0, p_total), pages_done = least(greatest(0, p_done), greatest(0, p_total))
  WHERE id = p_id AND tenant_id = p_tenant AND status = 'RUNNING';
  RETURN FOUND;
END $$;

-- Trạng thái OCR của các tệp (để polling). Chỉ trả tệp trong hồ sơ người gọi xem được, tệp chưa xóa, phiên bản mới nhất.
-- Không ghi nhật ký (nhật ký danh sách tệp đã có ở dms_list_files; polling vài giây một lần sẽ làm nhật ký phình vô ích).
CREATE FUNCTION dms_ocr_status(p_tenant uuid, p_actor uuid, p_files uuid[])
RETURNS TABLE (file_id uuid, ocr_status text, ocr_pages_done integer, ocr_pages_total integer)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
    SELECT f.id, r.status, r.pages_done, r.pages_total
    FROM dms_document_files f
    JOIN dms_documents d ON d.id = f.document_id AND d.tenant_id = f.tenant_id
    JOIN dms_case_files c ON c.id = d.case_id AND c.tenant_id = d.tenant_id
    JOIN dms_document_versions v ON v.file_id = f.id AND v.tenant_id = f.tenant_id
      AND v.version = (SELECT max(v2.version) FROM dms_document_versions v2 WHERE v2.tenant_id = v.tenant_id AND v2.file_id = v.file_id)
    LEFT JOIN dms_ocr_results r ON r.version_id = v.id AND r.tenant_id = v.tenant_id
    WHERE f.tenant_id = p_tenant AND f.id = ANY (p_files) AND f.deleted_at IS NULL
      AND dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by);
END $$;

-- Danh sách tệp kèm trạng thái OCR của phiên bản đó. Giữ nguyên bộ lọc file đã xóa (0105).
DROP FUNCTION dms_list_files(uuid, uuid, uuid);
CREATE FUNCTION dms_list_files(p_tenant uuid, p_actor uuid, p_document uuid)
RETURNS TABLE (id uuid, label text, is_scan boolean, version integer, sha256 text, mime text, size_bytes bigint, created_at timestamptz,
               ocr_status text, ocr_pages_done integer, ocr_pages_total integer)
LANGUAGE plpgsql AS $$
DECLARE d dms_documents; c dms_case_files;
BEGIN
  SELECT * INTO d FROM dms_documents WHERE dms_documents.id = p_document AND tenant_id = p_tenant;
  IF FOUND THEN SELECT * INTO c FROM dms_case_files WHERE dms_case_files.id = d.case_id AND tenant_id = p_tenant; END IF;
  IF NOT FOUND OR NOT dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.file.list', false, 'DOCUMENT_NOT_FOUND', NULL, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.file.list', true, 'ALLOWED', c.office_id, NULL, p_document::text);
  RETURN QUERY
    SELECT f.id, f.label, f.is_scan, v.version, v.sha256, v.mime, v.size_bytes, f.created_at,
           r.status, r.pages_done, r.pages_total
    FROM dms_document_files f
    JOIN dms_document_versions v ON v.file_id = f.id AND v.tenant_id = f.tenant_id
    LEFT JOIN dms_ocr_results r ON r.version_id = v.id AND r.tenant_id = v.tenant_id
    WHERE f.tenant_id = p_tenant AND f.document_id = p_document AND f.deleted_at IS NULL
    ORDER BY f.created_at, f.id, v.version;
END $$;
