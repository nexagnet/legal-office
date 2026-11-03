-- DMS GĐ 1 (PR 3): xóa mềm FILE SCAN, mục "Scan đã xóa (30 ngày)", hàm dọn sau 30 ngày, quyền xóa scan (N6, N7).
-- Căn cứ: reports/ke-hoach-code-theo-figma-2026-11-03.md. Luật (chủ dự án chốt 03/11/2026):
--   * CHỈ xóa FILE SCAN (trong hồ sơ và trong bản trình). Hồ sơ, STT, số hồ sơ, dòng sổ, tài liệu logic KHÔNG BAO GIỜ bị xóa.
--   * Người xóa: Admin văn phòng, hoặc tài khoản được cấp RIÊNG quyền `dms.scan.delete` (phạm vi cả văn phòng). Bắt buộc có lý do.
--     Quyền này chỉ cấp riêng cho từng tài khoản (dms_user_permission_overrides, có lý do + nhật ký), KHÔNG đặt vào nhóm quyền.
--   * File đã xóa biến khỏi mọi danh sách, đếm, tìm kiếm (kể cả nội dung OCR) và không tải được qua đường thường.
--     Admin vào mục "Scan đã xóa": chỉ XEM danh sách và TẢI XUỐNG trong 30 ngày; KHÔNG có khôi phục vào hồ sơ.
--   * Sau 30 ngày: job dọn xóa đối tượng ở kho tệp rồi đánh dấu purged_at (idempotent: chạy lại an toàn). Dòng ghi nhận và nhật ký còn mãi.
--   * Mọi lần xóa, tải file đã xóa và dọn đều ghi nhật ký nghiệp vụ.
-- Thiết kế: giữ nguyên bất biến — dòng tệp/phiên bản không bao giờ bị DELETE, nội dung không bao giờ bị UPDATE. Chỉ có hai bước chuyển
-- một chiều trên 5 cột mới: (chưa xóa) -> (đã xóa) -> (đã dọn), do trigger dms_scan_file_guard ép.
-- Chưa làm ở migration này (ghi rõ để không quên): văn bản OCR thô trong dms_ocr_results của file đã xóa vẫn còn trong bảng (bảng chỉ ghi thêm);
-- nó đã bị loại khỏi mọi tìm kiếm nhưng chưa được xóa khi dọn. Cần quyết định riêng vì bảng đó bất biến.

-- ===== Cột và ràng buộc =====
ALTER TABLE dms_document_files
  ADD COLUMN deleted_at timestamptz, ADD COLUMN deleted_by uuid, ADD COLUMN delete_reason text,
  ADD COLUMN purge_after timestamptz, ADD COLUMN purged_at timestamptz;
ALTER TABLE dms_submission_files
  ADD COLUMN deleted_at timestamptz, ADD COLUMN deleted_by uuid, ADD COLUMN delete_reason text,
  ADD COLUMN purge_after timestamptz, ADD COLUMN purged_at timestamptz;

ALTER TABLE dms_document_files ADD CONSTRAINT dms_document_files_deleted_chk CHECK (
  (deleted_at IS NULL AND deleted_by IS NULL AND delete_reason IS NULL AND purge_after IS NULL AND purged_at IS NULL)
  OR (deleted_at IS NOT NULL AND deleted_by IS NOT NULL AND btrim(coalesce(delete_reason, '')) <> '' AND purge_after IS NOT NULL
      AND purge_after >= deleted_at AND (purged_at IS NULL OR purged_at >= purge_after))
);
ALTER TABLE dms_submission_files ADD CONSTRAINT dms_submission_files_deleted_chk CHECK (
  (deleted_at IS NULL AND deleted_by IS NULL AND delete_reason IS NULL AND purge_after IS NULL AND purged_at IS NULL)
  OR (deleted_at IS NOT NULL AND deleted_by IS NOT NULL AND btrim(coalesce(delete_reason, '')) <> '' AND purge_after IS NOT NULL
      AND purge_after >= deleted_at AND (purged_at IS NULL OR purged_at >= purge_after))
);
CREATE INDEX dms_document_files_due_idx ON dms_document_files (tenant_id, purge_after) WHERE deleted_at IS NOT NULL AND purged_at IS NULL;
CREATE INDEX dms_submission_files_due_idx ON dms_submission_files (tenant_id, purge_after) WHERE deleted_at IS NOT NULL AND purged_at IS NULL;

-- ===== Bất biến mới: chỉ hai bước chuyển một chiều trên 5 cột xóa =====
CREATE FUNCTION dms_scan_file_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cols text[] := ARRAY['deleted_at', 'deleted_by', 'delete_reason', 'purge_after', 'purged_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% is append-only: rows cannot be deleted', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (to_jsonb(NEW) - cols) IS DISTINCT FROM (to_jsonb(OLD) - cols) THEN
    RAISE EXCEPTION '% content cannot change', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.deleted_at IS NULL THEN
    -- Chưa xóa -> đã xóa (chưa dọn).
    IF NEW.deleted_at IS NULL OR NEW.purged_at IS NOT NULL THEN
      RAISE EXCEPTION '% can only move to deleted', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF OLD.purged_at IS NULL THEN
    -- Đã xóa -> đã dọn: chỉ đặt purged_at, không đổi dấu vết xóa.
    IF NEW.purged_at IS NULL OR (NEW.deleted_at, NEW.deleted_by, NEW.delete_reason, NEW.purge_after)
       IS DISTINCT FROM (OLD.deleted_at, OLD.deleted_by, OLD.delete_reason, OLD.purge_after) THEN
      RAISE EXCEPTION '% deleted file can only be marked purged', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    RAISE EXCEPTION '% purged file is final', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER dms_document_files_ro ON dms_document_files;
DROP TRIGGER dms_submission_files_ro ON dms_submission_files;
CREATE TRIGGER dms_document_files_guard_trg BEFORE UPDATE OR DELETE ON dms_document_files FOR EACH ROW EXECUTE FUNCTION dms_scan_file_guard();
CREATE TRIGGER dms_submission_files_guard_trg BEFORE UPDATE OR DELETE ON dms_submission_files FOR EACH ROW EXECUTE FUNCTION dms_scan_file_guard();

-- Khi một file của hồ sơ bị xóa: bỏ nội dung OCR của file khỏi chỉ mục tìm kiếm và dựng lại chỉ mục hồ sơ (số scan).
CREATE FUNCTION dms_scan_after_delete() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid uuid;
BEGIN
  DELETE FROM dms_ocr_search_index WHERE tenant_id = NEW.tenant_id AND file_id = NEW.id;
  SELECT d.case_id INTO cid FROM dms_documents d WHERE d.id = NEW.document_id AND d.tenant_id = NEW.tenant_id;
  IF cid IS NOT NULL THEN PERFORM dms_case_index_refresh(NEW.tenant_id, cid); END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER dms_scan_after_delete_trg AFTER UPDATE OF deleted_at ON dms_document_files
  FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) EXECUTE FUNCTION dms_scan_after_delete();

-- ===== Vá các hàm đọc để file đã xóa biến mất khỏi danh sách, đếm, tìm kiếm, tải =====
-- Cùng cách vá đã dùng ở 0092/0096: lấy định nghĩa hiện hành, thay đúng đoạn, báo lỗi nếu không khớp (không âm thầm bỏ sót).
CREATE FUNCTION dms_tmp_patch(p_name text, p_old text, p_new text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record; def text; patched text; n integer := 0;
BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
            WHERE ns.nspname = current_schema() AND p.proname = p_name AND p.prokind = 'f' LOOP
    def := pg_get_functiondef(r.oid);
    patched := replace(def, p_old, p_new);
    IF patched = def THEN RAISE EXCEPTION '0105: % không có gì để vá (%)', p_name, p_old; END IF;
    EXECUTE patched;
    n := n + 1;
  END LOOP;
  IF n = 0 THEN RAISE EXCEPTION '0105: không tìm thấy hàm %', p_name; END IF;
END $$;

-- Đếm số scan: bỏ file đã xóa.
SELECT dms_tmp_patch('dms_list_cases', 'AND f.is_scan', 'AND f.is_scan AND f.deleted_at IS NULL');
SELECT dms_tmp_patch('dms_get_case', 'AND f.is_scan', 'AND f.is_scan AND f.deleted_at IS NULL');
SELECT dms_tmp_patch('dms_case_index_refresh', 'AND f.is_scan', 'AND f.is_scan AND f.deleted_at IS NULL');
SELECT dms_tmp_patch('dms_report_summary', 'AND f.is_scan', 'AND f.is_scan AND f.deleted_at IS NULL');
SELECT dms_tmp_patch('dms_list_documents', 'AND f.document_id = d.id AND f.is_scan)', 'AND f.document_id = d.id AND f.is_scan AND f.deleted_at IS NULL)');
SELECT dms_tmp_patch('dms_list_documents', 'AND f.document_id = d.id)', 'AND f.document_id = d.id AND f.deleted_at IS NULL)');
-- Danh sách tệp và tải tệp thường.
SELECT dms_tmp_patch('dms_list_files', 'WHERE f.tenant_id = p_tenant AND f.document_id = p_document', 'WHERE f.tenant_id = p_tenant AND f.document_id = p_document AND f.deleted_at IS NULL');
SELECT dms_tmp_patch('dms_file_download', 'WHERE dms_document_files.id = p_file AND tenant_id = p_tenant;', 'WHERE dms_document_files.id = p_file AND tenant_id = p_tenant AND deleted_at IS NULL;');
-- OCR: không nhận dạng file đã xóa; không đưa vào chỉ mục tìm kiếm; tìm toàn văn cũ cũng bỏ qua.
SELECT dms_tmp_patch('dms_ocr_claim', 'AND NOT EXISTS (SELECT 1 FROM dms_ocr_results r WHERE r.tenant_id = v.tenant_id AND r.version_id = v.id)',
  'AND NOT EXISTS (SELECT 1 FROM dms_ocr_results r WHERE r.tenant_id = v.tenant_id AND r.version_id = v.id)
    AND NOT EXISTS (SELECT 1 FROM dms_document_files df WHERE df.id = v.file_id AND df.tenant_id = v.tenant_id AND df.deleted_at IS NOT NULL)');
SELECT dms_tmp_patch('dms_ocr_claim', 'ORDER BY r.created_at, r.id',
  'AND NOT EXISTS (SELECT 1 FROM dms_document_versions pv JOIN dms_document_files pf ON pf.id = pv.file_id AND pf.tenant_id = pv.tenant_id
                    WHERE pv.id = r.version_id AND pv.tenant_id = r.tenant_id AND pf.deleted_at IS NOT NULL)
  ORDER BY r.created_at, r.id');
SELECT dms_tmp_patch('dms_ocr_search', 'AND d.status <> ''CANCELLED'' AND c.status <> ''CANCELLED''', 'AND d.status <> ''CANCELLED'' AND c.status <> ''CANCELLED'' AND f.deleted_at IS NULL');
SELECT dms_tmp_patch('dms_osi_sync_row', 'WHERE r.tenant_id = p_tenant AND r.version_id = p_version AND r.status = ''DONE''', 'WHERE r.tenant_id = p_tenant AND r.version_id = p_version AND r.status = ''DONE'' AND f.deleted_at IS NULL');
-- Bản trình (0104): đếm tệp, danh sách tệp, tải tệp.
SELECT dms_tmp_patch('dms_submission_list', 'FROM dms_submission_files f WHERE f.tenant_id = s.tenant_id AND f.submission_id = s.id)', 'FROM dms_submission_files f WHERE f.tenant_id = s.tenant_id AND f.submission_id = s.id AND f.deleted_at IS NULL)');
SELECT dms_tmp_patch('dms_submission_get', 'FROM dms_submission_files f WHERE f.tenant_id = s.tenant_id AND f.submission_id = s.id)', 'FROM dms_submission_files f WHERE f.tenant_id = s.tenant_id AND f.submission_id = s.id AND f.deleted_at IS NULL)');
SELECT dms_tmp_patch('dms_submission_files_list', 'WHERE f.tenant_id = p_tenant AND f.submission_id = p_submission ORDER BY', 'WHERE f.tenant_id = p_tenant AND f.submission_id = p_submission AND f.deleted_at IS NULL ORDER BY');
SELECT dms_tmp_patch('dms_submission_file_download', 'WHERE dms_submission_files.id = p_file AND tenant_id = p_tenant;', 'WHERE dms_submission_files.id = p_file AND tenant_id = p_tenant AND deleted_at IS NULL;');
DROP FUNCTION dms_tmp_patch(text, text, text);

-- ===== Quyền riêng `dms.scan.delete` =====
-- Cấp/thu riêng được (Admin đặt, bắt buộc lý do, có nhật ký). KHÔNG thêm vào ràng buộc nhóm quyền nên nhóm quyền không giữ được mã này.
CREATE OR REPLACE FUNCTION dms_user_overridable(p_code text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_code ~ '^(vibang|tongdat|xacminh|tochuc|vtden|vtdi|vtnb)\.(read|draft|confirm|add_document|download|amend_request)\.(own|all)$'
      OR p_code IN ('dms.stock.write', 'dms.legacy.import', 'dms.legacy.read', 'dms.audit.export', 'dms.scan.delete');
$$;
DO $do$
DECLARE r record; def text; patched text;
BEGIN
  SELECT p.oid INTO r FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace WHERE ns.nspname = current_schema() AND p.proname = 'dms_my_permissions';
  def := pg_get_functiondef(r.oid);
  patched := replace(def, '''dms.audit.export'', ''dms.stock.write''', '''dms.audit.export'', ''dms.scan.delete'', ''dms.stock.write''');
  IF patched = def THEN RAISE EXCEPTION '0105: dms_my_permissions không có gì để vá'; END IF;
  EXECUTE patched;
END $do$;

-- ===== Xóa =====
-- p_kind: 'document' (file trong tài liệu của hồ sơ, chỉ file scan) hoặc 'submission' (file của bản trình).
-- Cần thấy được hồ sơ/bản trình VÀ có quyền dms.scan.delete (Admin văn phòng mặc nhiên có). Hồ sơ/STT/dòng sổ không bị đụng.
CREATE FUNCTION dms_scan_delete(p_tenant uuid, p_actor uuid, p_kind text, p_file uuid, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE df dms_document_files; d dms_documents; c dms_case_files; sf dms_submission_files; s dms_submissions;
        office uuid; label_ text; due timestamptz := now() + interval '30 days';
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('document', 'submission') OR p_file IS NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.scan.delete', false, 'INVALID_INPUT', NULL, NULL, NULL);
  END IF;
  IF p_kind = 'document' THEN
    SELECT * INTO df FROM dms_document_files WHERE id = p_file AND tenant_id = p_tenant FOR UPDATE;
    IF FOUND THEN SELECT * INTO d FROM dms_documents WHERE id = df.document_id AND tenant_id = p_tenant; END IF;
    IF FOUND THEN SELECT * INTO c FROM dms_case_files WHERE id = d.case_id AND tenant_id = p_tenant; END IF;
    IF NOT FOUND OR NOT dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by, c.branch_id) THEN
      RETURN vibang_audit(p_tenant, p_actor, 'dms.scan.delete', false, 'FILE_NOT_FOUND', NULL, NULL, NULL);
    END IF;
    office := c.office_id;
  ELSE
    SELECT * INTO sf FROM dms_submission_files WHERE id = p_file AND tenant_id = p_tenant FOR UPDATE;
    IF FOUND THEN SELECT * INTO s FROM dms_submissions WHERE id = sf.submission_id AND tenant_id = p_tenant; END IF;
    IF NOT FOUND OR NOT dms_submission_visible(p_tenant, p_actor, s.office_id, s.submitted_by) THEN
      RETURN vibang_audit(p_tenant, p_actor, 'dms.scan.delete', false, 'FILE_NOT_FOUND', NULL, NULL, NULL);
    END IF;
    office := s.office_id;
  END IF;
  IF NOT dms_has_permission(p_tenant, p_actor, office, 'dms.scan.delete') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.scan.delete', false, 'PERMISSION_DENIED', office, NULL, p_file::text);
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' OR length(p_reason) > 1000 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.scan.delete', false, 'REASON_REQUIRED', office, NULL, p_file::text);
  END IF;
  IF p_kind = 'document' THEN
    IF df.deleted_at IS NOT NULL THEN
      RETURN vibang_audit(p_tenant, p_actor, 'dms.scan.delete', false, 'ALREADY_DELETED', office, NULL, p_file::text);
    END IF;
    IF NOT df.is_scan THEN
      RETURN vibang_audit(p_tenant, p_actor, 'dms.scan.delete', false, 'NOT_A_SCAN', office, NULL, p_file::text);
    END IF;
    label_ := df.label;
    UPDATE dms_document_files SET deleted_at = now(), deleted_by = p_actor, delete_reason = btrim(p_reason), purge_after = due
     WHERE id = p_file AND tenant_id = p_tenant;
    PERFORM dms_audit_rec(p_tenant, office, p_actor, 'dms.scan.delete', 'file', p_file,
                          jsonb_build_object('kind', p_kind, 'label', label_, 'case_id', c.id, 'document_id', d.id, 'purge_after', due));
  ELSE
    IF sf.deleted_at IS NOT NULL THEN
      RETURN vibang_audit(p_tenant, p_actor, 'dms.scan.delete', false, 'ALREADY_DELETED', office, NULL, p_file::text);
    END IF;
    label_ := sf.label;
    UPDATE dms_submission_files SET deleted_at = now(), deleted_by = p_actor, delete_reason = btrim(p_reason), purge_after = due
     WHERE id = p_file AND tenant_id = p_tenant;
    PERFORM dms_audit_rec(p_tenant, office, p_actor, 'dms.scan.delete', 'submission_file', p_file,
                          jsonb_build_object('kind', p_kind, 'label', label_, 'submission_id', s.id, 'purge_after', due));
  END IF;
  RETURN vibang_audit(p_tenant, p_actor, 'dms.scan.delete', true, 'SCAN_DELETED', office, NULL, p_file::text);
END $$;

-- ===== Mục "Scan đã xóa (30 ngày)": CHỈ Admin văn phòng =====
-- Danh sách file đã xóa mà chưa dọn (còn tải được). Không có hàm khôi phục.
CREATE FUNCTION dms_deleted_scans_list(p_tenant uuid, p_actor uuid, p_office uuid, p_limit integer, p_offset integer)
RETURNS TABLE (kind text, file_id uuid, label text, mime text, size_bytes bigint, deleted_at timestamptz, deleted_by uuid,
               delete_reason text, purge_after timestamptz, days_left integer,
               case_id uuid, case_number text, case_title text, domain text, submission_id uuid, submission_title text, total bigint)
LANGUAGE plpgsql AS $$
BEGIN
  IF p_office IS NULL OR NOT dms_office_admin(p_tenant, p_actor, p_office) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.scan.deleted_list', false, 'PERMISSION_DENIED', p_office, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.scan.deleted_list', true, 'ALLOWED', p_office, NULL, NULL);
  RETURN QUERY
    SELECT x.kind, x.file_id, x.label, x.mime, x.size_bytes, x.deleted_at, x.deleted_by, x.delete_reason, x.purge_after,
           greatest(0, ceil(extract(epoch FROM (x.purge_after - now())) / 86400)::integer),
           x.case_id, x.case_number, x.case_title, x.domain, x.submission_id, x.submission_title, count(*) OVER ()
    FROM (
      SELECT 'document'::text AS kind, f.id AS file_id, f.label, v.mime, v.size_bytes, f.deleted_at, f.deleted_by, f.delete_reason, f.purge_after,
             c.id AS case_id, c.case_number, c.title AS case_title, c.domain, NULL::uuid AS submission_id, NULL::text AS submission_title
        FROM dms_document_files f
        JOIN dms_documents d ON d.id = f.document_id AND d.tenant_id = f.tenant_id
        JOIN dms_case_files c ON c.id = d.case_id AND c.tenant_id = d.tenant_id
        JOIN LATERAL (SELECT vv.mime, vv.size_bytes FROM dms_document_versions vv WHERE vv.tenant_id = f.tenant_id AND vv.file_id = f.id
                       ORDER BY vv.version DESC LIMIT 1) v ON true
       WHERE f.tenant_id = p_tenant AND c.office_id = p_office AND f.deleted_at IS NOT NULL AND f.purged_at IS NULL
      UNION ALL
      SELECT 'submission', sf.id, sf.label, sf.mime, sf.size_bytes, sf.deleted_at, sf.deleted_by, sf.delete_reason, sf.purge_after,
             NULL::uuid, NULL::text, NULL::text, NULL::text, s.id, s.title
        FROM dms_submission_files sf
        JOIN dms_submissions s ON s.id = sf.submission_id AND s.tenant_id = sf.tenant_id
       WHERE sf.tenant_id = p_tenant AND s.office_id = p_office AND sf.deleted_at IS NOT NULL AND sf.purged_at IS NULL
    ) x
    ORDER BY x.deleted_at DESC, x.file_id
    LIMIT greatest(1, least(coalesce(p_limit, 50), 200)) OFFSET greatest(0, coalesce(p_offset, 0));
END $$;

-- Tải file đã xóa: Admin văn phòng, trong 30 ngày (trước purge_after) và chưa dọn. Trả khoá đối tượng MỌI phiên bản (mới nhất trước).
-- Mọi lần đều ghi nhật ký. Không đổi trạng thái file: đây là tải xuống, không phải khôi phục.
CREATE FUNCTION dms_deleted_scan_download(p_tenant uuid, p_actor uuid, p_kind text, p_file uuid)
RETURNS TABLE (object_key text, mime text, sha256 text, size_bytes bigint, label text, version integer)
LANGUAGE plpgsql AS $$
DECLARE df dms_document_files; d dms_documents; c dms_case_files; sf dms_submission_files; s dms_submissions; office uuid;
        dl timestamptz; pa timestamptz; pg_ timestamptz;
BEGIN
  IF p_kind = 'document' THEN
    SELECT * INTO df FROM dms_document_files WHERE id = p_file AND tenant_id = p_tenant;
    IF FOUND THEN SELECT * INTO d FROM dms_documents WHERE id = df.document_id AND tenant_id = p_tenant; END IF;
    IF FOUND THEN SELECT * INTO c FROM dms_case_files WHERE id = d.case_id AND tenant_id = p_tenant; END IF;
    IF FOUND THEN office := c.office_id; dl := df.deleted_at; pa := df.purge_after; pg_ := df.purged_at; END IF;
  ELSIF p_kind = 'submission' THEN
    SELECT * INTO sf FROM dms_submission_files WHERE id = p_file AND tenant_id = p_tenant;
    IF FOUND THEN SELECT * INTO s FROM dms_submissions WHERE id = sf.submission_id AND tenant_id = p_tenant; END IF;
    IF FOUND THEN office := s.office_id; dl := sf.deleted_at; pa := sf.purge_after; pg_ := sf.purged_at; END IF;
  END IF;
  IF office IS NULL OR NOT dms_office_admin(p_tenant, p_actor, office) OR dl IS NULL THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.scan.download_deleted', false, 'FILE_NOT_FOUND', NULL, NULL, NULL);
    RETURN;
  END IF;
  IF pg_ IS NOT NULL OR pa <= now() THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.scan.download_deleted', false, 'RETENTION_EXPIRED', office, NULL, p_file::text);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.scan.download_deleted', true, 'ALLOWED', office, NULL, p_file::text);
  PERFORM dms_audit_rec(p_tenant, office, p_actor, 'dms.scan.download_deleted', CASE WHEN p_kind = 'document' THEN 'file' ELSE 'submission_file' END,
                        p_file, '{}'::jsonb);
  IF p_kind = 'document' THEN
    RETURN QUERY SELECT v.object_key, v.mime, v.sha256, v.size_bytes, df.label, v.version
      FROM dms_document_versions v WHERE v.tenant_id = p_tenant AND v.file_id = p_file ORDER BY v.version DESC;
  ELSE
    RETURN QUERY SELECT sf.object_key, sf.mime, sf.sha256, sf.size_bytes, sf.label, 1;
  END IF;
END $$;

-- ===== Dọn sau 30 ngày (cho job nền, theo từng tenant) =====
-- Bước 1: lấy các tệp đã quá hạn kèm khoá đối tượng để job xóa ở kho tệp. Chỉ ĐỌC, không đổi gì; chạy lại an toàn.
CREATE FUNCTION dms_scan_purge_due(p_tenant uuid, p_limit integer)
RETURNS TABLE (kind text, file_id uuid, object_key text)
LANGUAGE sql STABLE AS $$
  SELECT x.kind, x.file_id, x.object_key FROM (
    SELECT 'document'::text AS kind, f.id AS file_id, v.object_key, f.purge_after
      FROM dms_document_files f JOIN dms_document_versions v ON v.file_id = f.id AND v.tenant_id = f.tenant_id
     WHERE f.tenant_id = p_tenant AND f.deleted_at IS NOT NULL AND f.purged_at IS NULL AND f.purge_after <= now()
    UNION ALL
    SELECT 'submission', sf.id, sf.object_key, sf.purge_after
      FROM dms_submission_files sf
     WHERE sf.tenant_id = p_tenant AND sf.deleted_at IS NOT NULL AND sf.purged_at IS NULL AND sf.purge_after <= now()
  ) x
  ORDER BY x.purge_after, x.file_id
  LIMIT greatest(1, least(coalesce(p_limit, 100), 1000))
$$;

-- Bước 2: sau khi đã xóa đối tượng ở kho tệp, đánh dấu đã dọn và ghi nhật ký (người thực hiện: tài khoản hệ thống toàn số 0).
-- Trả true nếu lần gọi này vừa đánh dấu; false nếu chưa đến hạn, không tồn tại hoặc đã dọn trước đó (idempotent).
CREATE FUNCTION dms_scan_purge_done(p_tenant uuid, p_kind text, p_file uuid) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE n integer; office uuid; sys uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  IF p_kind = 'document' THEN
    UPDATE dms_document_files SET purged_at = now()
     WHERE id = p_file AND tenant_id = p_tenant AND deleted_at IS NOT NULL AND purged_at IS NULL AND purge_after <= now();
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 1 THEN
      SELECT c.office_id INTO office FROM dms_document_files f JOIN dms_documents d ON d.id = f.document_id AND d.tenant_id = f.tenant_id
        JOIN dms_case_files c ON c.id = d.case_id AND c.tenant_id = d.tenant_id WHERE f.id = p_file AND f.tenant_id = p_tenant;
      PERFORM dms_audit_rec(p_tenant, office, sys, 'dms.scan.purge', 'file', p_file, '{}'::jsonb);
    END IF;
  ELSIF p_kind = 'submission' THEN
    UPDATE dms_submission_files SET purged_at = now()
     WHERE id = p_file AND tenant_id = p_tenant AND deleted_at IS NOT NULL AND purged_at IS NULL AND purge_after <= now();
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 1 THEN
      SELECT s.office_id INTO office FROM dms_submission_files sf JOIN dms_submissions s ON s.id = sf.submission_id AND s.tenant_id = sf.tenant_id
       WHERE sf.id = p_file AND sf.tenant_id = p_tenant;
      PERFORM dms_audit_rec(p_tenant, office, sys, 'dms.scan.purge', 'submission_file', p_file, '{}'::jsonb);
    END IF;
  ELSE
    RETURN false;
  END IF;
  RETURN n = 1;
END $$;
