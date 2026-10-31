-- DMS Phase 2 (lát 5c): thừa hành viên (THV) được ghi tên trong hồ sơ phải TỰ bấm xác nhận trên phần mềm (owner 2026-10-31).
-- Luật:
--   * Bản nháp có thể ghi tên một THV (dms_case_set_thv). Người nhập liệu chọn tên KHÔNG đủ: hồ sơ có ghi tên THV chỉ
--     "Xác nhận lưu chính thức" được khi chính THV đó đã xác nhận ĐÚNG nội dung hiện tại (THV_CONFIRMATION_REQUIRED).
--   * Xác nhận gắn với dấu vân nội dung (title + thuộc tính hồ sơ + tài liệu). Sửa nội dung sau khi THV xác nhận làm
--     xác nhận hết hiệu lực (THV_CONFIRMATION_STALE) và THV phải xác nhận lại.
--   * THV đọc được nội dung cần xác nhận (không có tệp scan) CHỈ khi được ghi tên trong bản nháp đó; không mở rộng quyền xem hồ sơ khác.
--   * Xác nhận chỉ ghi thêm, không sửa, không xoá.

ALTER TABLE dms_case_files ADD COLUMN thv_user_id uuid;
ALTER TABLE dms_case_files ADD CONSTRAINT dms_case_files_thv_fk FOREIGN KEY (thv_user_id, tenant_id) REFERENCES users (id, tenant_id);

CREATE TABLE dms_thv_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  case_id uuid NOT NULL,
  thv_user_id uuid NOT NULL,
  content_hash text NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dms_thv_conf_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES dms_case_files (id, tenant_id),
  CONSTRAINT dms_thv_conf_user_fk FOREIGN KEY (thv_user_id, tenant_id) REFERENCES users (id, tenant_id)
);
CREATE INDEX dms_thv_conf_case_idx ON dms_thv_confirmations (tenant_id, case_id, thv_user_id, confirmed_at DESC);
ALTER TABLE dms_thv_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_thv_confirmations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dms_thv_confirmations
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
CREATE TRIGGER dms_thv_conf_append_only BEFORE UPDATE OR DELETE ON dms_thv_confirmations FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER dms_thv_conf_no_truncate BEFORE TRUNCATE ON dms_thv_confirmations FOR EACH STATEMENT EXECUTE FUNCTION vibang_append_only();

-- Dấu vân nội dung: thay đổi bất kỳ ở tiêu đề, thuộc tính hồ sơ, hay (loại, tên, thuộc tính) của tài liệu còn hiệu lực đều đổi dấu.
CREATE FUNCTION dms_case_content_hash(p_tenant uuid, p_case uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT md5(jsonb_build_object(
    'title', c.title,
    'attributes', c.attributes,
    'documents', coalesce((SELECT jsonb_agg(jsonb_build_array(d.kind, d.title, d.is_official, d.attributes) ORDER BY d.created_at, d.id)
                           FROM dms_documents d WHERE d.tenant_id = c.tenant_id AND d.case_id = c.id AND d.status <> 'CANCELLED'), '[]'::jsonb)
  )::text)
  FROM dms_case_files c WHERE c.id = p_case AND c.tenant_id = p_tenant
$$;

-- Ghi tên (hoặc bỏ tên) THV trên bản nháp. Quyền như sửa nháp.
CREATE FUNCTION dms_case_set_thv(p_tenant uuid, p_actor uuid, p_case uuid, p_thv uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE l record; c dms_case_files;
BEGIN
  SELECT * INTO l FROM dms_case_load(p_tenant, p_actor, p_case, 'dms.case.set_thv', 'draft');
  IF l.denied IS NOT NULL THEN RETURN ROW(false, l.denied, NULL)::vibang_op; END IF;
  c := l.c;
  IF c.status <> 'DRAFT' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.set_thv', false, 'CASE_NOT_DRAFT', c.office_id, NULL, p_case::text);
  END IF;
  IF p_thv IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users WHERE id = p_thv AND tenant_id = p_tenant) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.set_thv', false, 'USER_NOT_FOUND', c.office_id, NULL, p_case::text);
  END IF;
  UPDATE dms_case_files SET thv_user_id = p_thv WHERE id = p_case AND tenant_id = p_tenant;
  PERFORM dms_audit_rec(p_tenant, c.office_id, p_actor, 'dms.case.set_thv', 'case', p_case, jsonb_build_object('thv_user_id', p_thv));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.case.set_thv', true, 'THV_SET', c.office_id, NULL, p_case::text);
END $$;

-- Các bản nháp đang chờ chính THV này xác nhận (chưa xác nhận hoặc xác nhận đã cũ).
CREATE FUNCTION dms_list_thv_pending(p_tenant uuid, p_actor uuid)
RETURNS TABLE (case_id uuid, office_id uuid, domain text, title text, created_by uuid, created_at timestamptz, stale boolean)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.thv.list', true, 'ALLOWED', NULL, NULL, NULL);
  RETURN QUERY
    SELECT c.id, c.office_id, c.domain, c.title, c.created_by, c.created_at,
           EXISTS (SELECT 1 FROM dms_thv_confirmations f WHERE f.tenant_id = c.tenant_id AND f.case_id = c.id AND f.thv_user_id = p_actor)
    FROM dms_case_files c
    WHERE c.tenant_id = p_tenant AND c.status = 'DRAFT' AND c.thv_user_id = p_actor
      AND NOT EXISTS (SELECT 1 FROM dms_thv_confirmations f
                      WHERE f.tenant_id = c.tenant_id AND f.case_id = c.id AND f.thv_user_id = p_actor
                        AND f.content_hash = dms_case_content_hash(c.tenant_id, c.id))
    ORDER BY c.created_at, c.id;
END $$;

-- Nội dung THV cần xác nhận (không có tệp). Chỉ THV được ghi tên, chỉ khi còn là nháp.
CREATE FUNCTION dms_thv_review_case(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (case_id uuid, domain text, title text, attributes jsonb, created_by uuid, documents jsonb, confirmed boolean)
LANGUAGE plpgsql AS $$
DECLARE c dms_case_files;
BEGIN
  SELECT * INTO c FROM dms_case_files WHERE id = p_case AND tenant_id = p_tenant;
  IF NOT FOUND OR c.status <> 'DRAFT' OR c.thv_user_id IS DISTINCT FROM p_actor THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.thv.review', false, 'CASE_NOT_FOUND', NULL, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.thv.review', true, 'ALLOWED', c.office_id, NULL, p_case::text);
  RETURN QUERY
    SELECT c.id, c.domain, c.title, c.attributes, c.created_by,
           coalesce((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'kind', d.kind, 'title', d.title, 'is_official', d.is_official, 'attributes', d.attributes)
                                      ORDER BY d.created_at, d.id)
                     FROM dms_documents d WHERE d.tenant_id = c.tenant_id AND d.case_id = c.id AND d.status <> 'CANCELLED'), '[]'::jsonb),
           EXISTS (SELECT 1 FROM dms_thv_confirmations f
                   WHERE f.tenant_id = c.tenant_id AND f.case_id = c.id AND f.thv_user_id = p_actor
                     AND f.content_hash = dms_case_content_hash(c.tenant_id, c.id));
END $$;

-- THV bấm xác nhận nội dung hiện tại. Chỉ chính THV được ghi tên.
CREATE FUNCTION dms_thv_confirm(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c dms_case_files;
BEGIN
  SELECT * INTO c FROM dms_case_files WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND OR c.thv_user_id IS DISTINCT FROM p_actor THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.thv.confirm', false, 'CASE_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  IF c.status <> 'DRAFT' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.thv.confirm', false, 'CASE_NOT_DRAFT', c.office_id, NULL, p_case::text);
  END IF;
  INSERT INTO dms_thv_confirmations (tenant_id, office_id, case_id, thv_user_id, content_hash)
  VALUES (p_tenant, c.office_id, p_case, p_actor, dms_case_content_hash(p_tenant, p_case));
  PERFORM dms_audit_rec(p_tenant, c.office_id, p_actor, 'dms.thv.confirm', 'case', p_case, '{}'::jsonb);
  RETURN vibang_audit(p_tenant, p_actor, 'dms.thv.confirm', true, 'THV_CONFIRMED', c.office_id, NULL, p_case::text);
END $$;

-- "Xác nhận lưu chính thức": như 0075, thêm cổng THV trước khi ghi sổ.
CREATE OR REPLACE FUNCTION dms_case_record(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE l record; c dms_case_files; n integer; book text; d record; conf_hash text;
BEGIN
  SELECT * INTO l FROM dms_case_load(p_tenant, p_actor, p_case, 'dms.case.record', 'confirm');
  IF l.denied IS NOT NULL THEN RETURN ROW(false, l.denied, NULL)::vibang_op; END IF;
  c := l.c;
  IF c.status <> 'DRAFT' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.record', false, 'CASE_NOT_DRAFT', c.office_id, NULL, p_case::text);
  END IF;
  IF c.thv_user_id IS NOT NULL THEN
    SELECT f.content_hash INTO conf_hash FROM dms_thv_confirmations f
     WHERE f.tenant_id = p_tenant AND f.case_id = p_case AND f.thv_user_id = c.thv_user_id
     ORDER BY f.confirmed_at DESC, f.id DESC LIMIT 1;
    IF conf_hash IS NULL THEN
      RETURN vibang_audit(p_tenant, p_actor, 'dms.case.record', false, 'THV_CONFIRMATION_REQUIRED', c.office_id, NULL, p_case::text);
    ELSIF conf_hash <> dms_case_content_hash(p_tenant, p_case) THEN
      RETURN vibang_audit(p_tenant, p_actor, 'dms.case.record', false, 'THV_CONFIRMATION_STALE', c.office_id, NULL, p_case::text);
    END IF;
  END IF;
  UPDATE dms_documents SET status = 'RECORDED' WHERE case_id = p_case AND tenant_id = p_tenant AND status = 'DRAFT';
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE dms_case_files SET status = 'RECORDED', recorded_by = p_actor, recorded_at = now() WHERE id = p_case AND tenant_id = p_tenant;
  book := dms_book_of(c.domain);
  IF book = 'S-01' THEN
    FOR d IN SELECT id FROM dms_documents WHERE case_id = p_case AND tenant_id = p_tenant AND status = 'RECORDED' ORDER BY created_at, id LOOP
      PERFORM dms_book_allocate(p_tenant, p_actor, c.office_id, book, p_case, d.id);
    END LOOP;
  ELSIF book IS NOT NULL THEN
    PERFORM dms_book_allocate(p_tenant, p_actor, c.office_id, book, p_case, NULL);
  END IF;
  PERFORM dms_audit_rec(p_tenant, c.office_id, p_actor, 'dms.case.record', 'case', p_case, jsonb_build_object('documents_recorded', n));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.case.record', true, 'CASE_RECORDED', c.office_id, NULL, p_case::text);
END $$;

-- Trang chi tiết cần biết THV được ghi tên: dms_get_case trả thêm thv_user_id và trạng thái xác nhận.
DROP FUNCTION dms_get_case(uuid, uuid, uuid);
CREATE FUNCTION dms_get_case(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (id uuid, office_id uuid, domain text, title text, status text, attributes jsonb, created_by uuid,
               created_at timestamptz, recorded_at timestamptz, cancelled_at timestamptz, cancel_reason text,
               document_count integer, scan_count integer, thv_user_id uuid, thv_confirmed boolean)
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
             WHERE f.tenant_id = c.tenant_id AND d.case_id = c.id AND d.status <> 'CANCELLED' AND f.is_scan),
           c.thv_user_id,
           CASE WHEN c.thv_user_id IS NULL THEN NULL ELSE EXISTS (
             SELECT 1 FROM dms_thv_confirmations f
              WHERE f.tenant_id = c.tenant_id AND f.case_id = c.id AND f.thv_user_id = c.thv_user_id
                AND f.content_hash = dms_case_content_hash(c.tenant_id, c.id)) END;
END $$;
