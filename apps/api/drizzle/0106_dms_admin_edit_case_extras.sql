-- DMS Giai đoạn 2a: đọc thêm số hồ sơ / cờ đã trả / SĐT cho danh sách, và Admin sửa trực tiếp hồ sơ đã ghi sổ.
--
--   * Quy tắc nghiệp vụ N5: nhân viên chỉ được tải thêm scan sau khi ghi sổ; CHỈ Admin được sửa nội dung hồ sơ/tài liệu đã ghi sổ.
--   * Sửa của Admin KHÔNG ghi đè cột gốc: mỗi lần sửa thêm một dòng vào dms_case_revisions / dms_document_revisions
--     (cơ chế "giá trị hiện hành" có sẵn từ 0079), nên mọi hàm đọc, sổ, chỉ mục tìm kiếm tự lấy giá trị mới và vẫn còn lịch sử trước/sau.
--   * Bản sửa của Admin không đi qua yêu cầu sửa đổi: amendment_id cho phép NULL, thay vào đó BẮT BUỘC có lý do (CHECK).
--   * Không đổi chữ ký hàm đọc đang có (dms_list_cases, dms_get_case): thêm hàm dms_case_extras để API gộp dữ liệu.
--   * Không xóa cột nào. Hồ sơ/STT/dòng sổ vẫn không bao giờ bị xóa.

ALTER TABLE dms_case_revisions ALTER COLUMN amendment_id DROP NOT NULL;
ALTER TABLE dms_case_revisions ADD COLUMN reason text;
ALTER TABLE dms_case_revisions ADD CONSTRAINT dms_case_revisions_source_chk
  CHECK (amendment_id IS NOT NULL OR btrim(coalesce(reason, '')) <> '');

ALTER TABLE dms_document_revisions ALTER COLUMN amendment_id DROP NOT NULL;
ALTER TABLE dms_document_revisions ADD COLUMN reason text;
ALTER TABLE dms_document_revisions ADD CONSTRAINT dms_document_revisions_source_chk
  CHECK (amendment_id IS NOT NULL OR btrim(coalesce(reason, '')) <> '');

-- Danh sách phiên bản: bản Admin sửa trực tiếp lấy lý do từ chính dòng revision (không có yêu cầu sửa đổi đi kèm).
DO $$
DECLARE def text; patched text; r record;
BEGIN
  SELECT p.oid INTO r FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = current_schema() AND p.proname = 'dms_case_revision_list';
  def := pg_get_functiondef(r.oid);
  patched := replace(def, '    JOIN dms_amendment_requests a ON a.id = r.amendment_id', '    LEFT JOIN dms_amendment_requests a ON a.id = r.amendment_id');
  IF patched = def THEN RAISE EXCEPTION 'dms_admin_edit: dms_case_revision_list không có gì để vá (join)'; END IF;
  def := patched;
  patched := replace(def, E'         a.reason\n', E'         coalesce(a.reason, r.reason)\n');
  IF patched = def THEN RAISE EXCEPTION 'dms_admin_edit: dms_case_revision_list không có gì để vá (reason)'; END IF;
  EXECUTE patched;
END $$;

-- ===== Số hồ sơ, cờ đã trả, SĐT theo danh sách hồ sơ =====
-- Chỉ trả hồ sơ mà người xem được phép thấy (cùng chốt dms_case_visible với danh sách). SĐT lấy từ thuộc tính HIỆN HÀNH
-- (`so_dien_thoai`) nên Admin sửa xong là danh sách thấy ngay. SĐT chỉ để hiển thị trong 4 miền, KHÔNG nằm trong cột sổ.
CREATE FUNCTION dms_case_extras(p_tenant uuid, p_actor uuid, p_cases uuid[])
RETURNS TABLE (case_id uuid, case_number text, returned boolean, phone text)
LANGUAGE sql STABLE AS $$
  SELECT c.id, c.case_number, coalesce(r.returned, false),
         nullif(btrim(coalesce((SELECT e.attributes ->> 'so_dien_thoai' FROM dms_case_effective(c.tenant_id, c.id) e), '')), '')
    FROM dms_case_files c
    LEFT JOIN dms_case_returned r ON r.tenant_id = c.tenant_id AND r.case_id = c.id
   WHERE c.tenant_id = p_tenant AND c.id = ANY (p_cases)
     AND dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by, c.branch_id)
$$;

-- ===== Admin sửa hồ sơ đã ghi sổ =====
-- Chỉ ADMIN của văn phòng. Thuộc tính gửi lên được GỘP vào giá trị hiện hành (khóa có giá trị null nghĩa là xóa khóa đó).
-- Phải có lý do. Không đổi gì thì trả NOTHING_TO_CHANGE và không ghi.
CREATE FUNCTION dms_case_admin_edit(p_tenant uuid, p_actor uuid, p_case uuid, p_title text, p_attributes jsonb, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE l record; c dms_case_files; cur record; new_title text; new_attrs jsonb; n integer;
BEGIN
  SELECT * INTO l FROM dms_case_load(p_tenant, p_actor, p_case, 'dms.case.admin_edit', 'add_document');
  IF l.denied IS NOT NULL THEN RETURN ROW(false, l.denied, NULL)::vibang_op; END IF;
  c := l.c;
  IF NOT dms_office_admin(p_tenant, p_actor, c.office_id) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.admin_edit', false, 'ADMIN_ONLY', c.office_id, NULL, p_case::text);
  END IF;
  IF c.status <> 'RECORDED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.admin_edit', false, 'CASE_NOT_RECORDED', c.office_id, NULL, p_case::text);
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.admin_edit', false, 'REASON_REQUIRED', c.office_id, NULL, p_case::text);
  END IF;
  IF p_attributes IS NOT NULL AND jsonb_typeof(p_attributes) <> 'object' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.admin_edit', false, 'INVALID_INPUT', c.office_id, NULL, p_case::text);
  END IF;
  SELECT * INTO cur FROM dms_case_effective(p_tenant, p_case);
  new_title := coalesce(nullif(btrim(coalesce(p_title, '')), ''), cur.title);
  new_attrs := (SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
                  FROM jsonb_each(cur.attributes || coalesce(p_attributes, '{}'::jsonb)) e
                 WHERE jsonb_typeof(e.value) <> 'null');
  IF new_title = cur.title AND new_attrs = cur.attributes THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.admin_edit', false, 'NOTHING_TO_CHANGE', c.office_id, NULL, p_case::text);
  END IF;
  SELECT coalesce(max(rev), 0) + 1 INTO n FROM dms_case_revisions WHERE tenant_id = p_tenant AND case_id = p_case;
  INSERT INTO dms_case_revisions (tenant_id, case_id, rev, title, attributes, amendment_id, reason, created_by)
  VALUES (p_tenant, p_case, n, new_title, new_attrs, NULL, btrim(p_reason), p_actor);
  PERFORM dms_audit_rec(p_tenant, c.office_id, p_actor, 'dms.case.admin_edit', 'case', p_case, jsonb_build_object('rev', n));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.case.admin_edit', true, 'CASE_EDITED', c.office_id, NULL, p_case::text);
END $$;

-- Tài liệu của hồ sơ đã ghi sổ: cùng luật (Admin, có lý do, gộp thuộc tính, ghi revision).
CREATE FUNCTION dms_document_admin_edit(p_tenant uuid, p_actor uuid, p_document uuid, p_attributes jsonb, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE d dms_documents; l record; c dms_case_files; cur jsonb; new_attrs jsonb; n integer;
BEGIN
  SELECT * INTO d FROM dms_documents WHERE id = p_document AND tenant_id = p_tenant;
  IF NOT FOUND THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.document.admin_edit', false, 'DOCUMENT_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  SELECT * INTO l FROM dms_case_load(p_tenant, p_actor, d.case_id, 'dms.document.admin_edit', 'add_document');
  IF l.denied IS NOT NULL THEN RETURN ROW(false, CASE WHEN l.denied = 'CASE_NOT_FOUND' THEN 'DOCUMENT_NOT_FOUND' ELSE l.denied END, NULL)::vibang_op; END IF;
  c := l.c;
  IF NOT dms_office_admin(p_tenant, p_actor, c.office_id) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.document.admin_edit', false, 'ADMIN_ONLY', c.office_id, NULL, p_document::text);
  END IF;
  IF c.status <> 'RECORDED' OR d.status <> 'RECORDED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.document.admin_edit', false, 'CASE_NOT_RECORDED', c.office_id, NULL, p_document::text);
  END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.document.admin_edit', false, 'REASON_REQUIRED', c.office_id, NULL, p_document::text);
  END IF;
  IF p_attributes IS NULL OR jsonb_typeof(p_attributes) <> 'object' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.document.admin_edit', false, 'INVALID_INPUT', c.office_id, NULL, p_document::text);
  END IF;
  cur := dms_doc_effective_attrs(p_tenant, p_document);
  new_attrs := (SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
                  FROM jsonb_each(cur || p_attributes) e WHERE jsonb_typeof(e.value) <> 'null');
  IF new_attrs = cur THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.document.admin_edit', false, 'NOTHING_TO_CHANGE', c.office_id, NULL, p_document::text);
  END IF;
  SELECT coalesce(max(rev), 0) + 1 INTO n FROM dms_document_revisions WHERE tenant_id = p_tenant AND document_id = p_document;
  INSERT INTO dms_document_revisions (tenant_id, document_id, rev, attributes, amendment_id, reason, created_by)
  VALUES (p_tenant, p_document, n, new_attrs, NULL, btrim(p_reason), p_actor);
  PERFORM dms_audit_rec(p_tenant, c.office_id, p_actor, 'dms.document.admin_edit', 'document', p_document, jsonb_build_object('rev', n));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.document.admin_edit', true, 'DOCUMENT_EDITED', c.office_id, NULL, p_document::text);
END $$;
