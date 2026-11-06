-- DMS Phase 2: STT của sổ nghiệp vụ S-01/S-02/S-04/S-05 (TT 08/2026/TT-BTP) và dữ liệu xuất sổ.
-- Luật (owner 2026-10-30, Figma "Xuất sổ"):
--   * Hệ thống tự cấp STT theo SỔ, văn phòng và NĂM (giờ Việt Nam); KHÔNG tự cấp số văn bản pháp lý (đó là dữ liệu người nhập).
--   * STT cấp lúc "Xác nhận lưu chính thức", theo thứ tự lưu. Nháp và nháp đã hủy không có STT, không vào sổ.
--   * Bộ đếm chỉ tăng, không dùng lại số. Dòng sổ chỉ ghi thêm, không sửa, không xoá.
--   * S-02, S-04, S-05: một dòng cho mỗi HỒ SƠ. S-01 (tống đạt): một dòng cho mỗi GIẤY TỜ cần tống đạt.
--   * Giá trị các cột lấy từ thuộc tính nhập tay của hồ sơ/tài liệu (jsonb); khoá thuộc tính do tầng ứng dụng định nghĩa.

ALTER TABLE dms_documents ADD COLUMN attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object');

CREATE TABLE dms_book_counters (
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  book text NOT NULL CHECK (book IN ('S-01', 'S-02', 'S-04', 'S-05')),
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  last_value integer NOT NULL CHECK (last_value >= 1),
  PRIMARY KEY (tenant_id, office_id, book, year),
  CONSTRAINT dms_book_counters_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id)
);

CREATE TABLE dms_book_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  book text NOT NULL CHECK (book IN ('S-01', 'S-02', 'S-04', 'S-05')),
  year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  stt integer NOT NULL CHECK (stt >= 1),
  case_id uuid NOT NULL,
  document_id uuid,
  allocated_by uuid NOT NULL,
  allocated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dms_book_entries_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES dms_case_files (id, tenant_id),
  CONSTRAINT dms_book_entries_doc_fk FOREIGN KEY (document_id, tenant_id) REFERENCES dms_documents (id, tenant_id),
  CONSTRAINT dms_book_entries_stt_uq UNIQUE (tenant_id, office_id, book, year, stt)
);
-- Một hồ sơ (hoặc một giấy tờ) chỉ có MỘT dòng trong một sổ.
CREATE UNIQUE INDEX dms_book_entries_target_uq ON dms_book_entries
  (tenant_id, book, case_id, coalesce(document_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE dms_book_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_book_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dms_book_counters
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
ALTER TABLE dms_book_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_book_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dms_book_entries
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE TRIGGER dms_book_entries_append_only BEFORE UPDATE OR DELETE ON dms_book_entries FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER dms_book_entries_no_truncate BEFORE TRUNCATE ON dms_book_entries FOR EACH STATEMENT EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER dms_book_counters_no_delete BEFORE DELETE ON dms_book_counters FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER dms_book_counters_no_truncate BEFORE TRUNCATE ON dms_book_counters FOR EACH STATEMENT EXECUTE FUNCTION vibang_append_only();

-- Miền nghiệp vụ -> sổ.
CREATE FUNCTION dms_book_of(p_domain text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_domain WHEN 'tongdat' THEN 'S-01' WHEN 'vibang' THEN 'S-02' WHEN 'xacminh' THEN 'S-04' WHEN 'tochuc' THEN 'S-05' END
$$;

-- Cấp STT kế tiếp (nguyên tử: khoá dòng bộ đếm trong giao dịch). Năm theo giờ Việt Nam.
CREATE FUNCTION dms_book_allocate(p_tenant uuid, p_actor uuid, p_office uuid, p_book text, p_case uuid, p_document uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE y integer := extract(year FROM now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer; n integer;
BEGIN
  INSERT INTO dms_book_counters (tenant_id, office_id, book, year, last_value) VALUES (p_tenant, p_office, p_book, y, 1)
  ON CONFLICT (tenant_id, office_id, book, year) DO UPDATE SET last_value = dms_book_counters.last_value + 1
  RETURNING last_value INTO n;
  INSERT INTO dms_book_entries (tenant_id, office_id, book, year, stt, case_id, document_id, allocated_by)
  VALUES (p_tenant, p_office, p_book, y, n, p_case, p_document, p_actor);
  RETURN n;
END $$;

-- Thêm tài liệu: nhận thêm thuộc tính (tuỳ chọn). Nếu hồ sơ tống đạt ĐÃ ghi sổ thì giấy tờ mới vào sổ S-01 ngay.
DROP FUNCTION dms_document_add(uuid, uuid, uuid, text, text, boolean);
CREATE FUNCTION dms_document_add(p_tenant uuid, p_actor uuid, p_case uuid, p_kind text, p_title text, p_is_official boolean, p_attributes jsonb DEFAULT NULL)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE l record; c dms_case_files; new_id uuid;
BEGIN
  SELECT * INTO l FROM dms_case_load(p_tenant, p_actor, p_case, 'dms.document.add', 'add_document');
  IF l.denied IS NOT NULL THEN RETURN ROW(false, l.denied, NULL)::vibang_op; END IF;
  c := l.c;
  IF c.status = 'CANCELLED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.document.add', false, 'CASE_CANCELLED', c.office_id, NULL, p_case::text);
  END IF;
  IF btrim(coalesce(p_kind, '')) = '' OR btrim(coalesce(p_title, '')) = ''
     OR jsonb_typeof(coalesce(p_attributes, '{}'::jsonb)) <> 'object' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.document.add', false, 'INVALID_INPUT', c.office_id, NULL, p_case::text);
  END IF;
  INSERT INTO dms_documents (tenant_id, case_id, kind, title, is_official, status, created_by, attributes)
  VALUES (p_tenant, p_case, btrim(p_kind), btrim(p_title), coalesce(p_is_official, false), c.status, p_actor, coalesce(p_attributes, '{}'::jsonb))
  RETURNING id INTO new_id;
  IF c.status = 'RECORDED' AND c.domain = 'tongdat' THEN
    PERFORM dms_book_allocate(p_tenant, p_actor, c.office_id, 'S-01', p_case, new_id);
  END IF;
  PERFORM dms_audit_rec(p_tenant, c.office_id, p_actor, 'dms.document.add', 'document', new_id, jsonb_build_object('case_id', p_case, 'status', c.status));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.document.add', true, 'DOCUMENT_ADDED', c.office_id, NULL, new_id::text);
END $$;

DROP FUNCTION dms_document_update_draft(uuid, uuid, uuid, text, text, boolean);
CREATE FUNCTION dms_document_update_draft(p_tenant uuid, p_actor uuid, p_document uuid, p_kind text, p_title text, p_is_official boolean, p_attributes jsonb DEFAULT NULL)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE d dms_documents; l record; c dms_case_files;
BEGIN
  SELECT * INTO d FROM dms_documents WHERE id = p_document AND tenant_id = p_tenant;
  IF NOT FOUND THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.document.update_draft', false, 'DOCUMENT_NOT_FOUND', NULL, NULL, NULL);
  END IF;
  SELECT * INTO l FROM dms_case_load(p_tenant, p_actor, d.case_id, 'dms.document.update_draft', 'draft');
  IF l.denied IS NOT NULL THEN RETURN ROW(false, CASE WHEN l.denied = 'CASE_NOT_FOUND' THEN 'DOCUMENT_NOT_FOUND' ELSE l.denied END, NULL)::vibang_op; END IF;
  c := l.c;
  SELECT * INTO d FROM dms_documents WHERE id = p_document AND tenant_id = p_tenant FOR UPDATE;
  IF d.status <> 'DRAFT' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.document.update_draft', false, 'DOCUMENT_NOT_DRAFT', c.office_id, NULL, p_document::text);
  END IF;
  IF btrim(coalesce(p_kind, '')) = '' OR btrim(coalesce(p_title, '')) = ''
     OR (p_attributes IS NOT NULL AND jsonb_typeof(p_attributes) <> 'object') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.document.update_draft', false, 'INVALID_INPUT', c.office_id, NULL, p_document::text);
  END IF;
  UPDATE dms_documents SET kind = btrim(p_kind), title = btrim(p_title), is_official = coalesce(p_is_official, false),
         attributes = coalesce(p_attributes, attributes)
   WHERE id = p_document AND tenant_id = p_tenant;
  PERFORM dms_audit_rec(p_tenant, c.office_id, p_actor, 'dms.document.update_draft', 'document', p_document, '{}'::jsonb);
  RETURN vibang_audit(p_tenant, p_actor, 'dms.document.update_draft', true, 'DOCUMENT_DRAFT_UPDATED', c.office_id, NULL, p_document::text);
END $$;

-- "Xác nhận lưu chính thức": như 0071 và cấp STT vào sổ cùng giao dịch.
CREATE OR REPLACE FUNCTION dms_case_record(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE l record; c dms_case_files; n integer; book text; d record;
BEGIN
  SELECT * INTO l FROM dms_case_load(p_tenant, p_actor, p_case, 'dms.case.record', 'confirm');
  IF l.denied IS NOT NULL THEN RETURN ROW(false, l.denied, NULL)::vibang_op; END IF;
  c := l.c;
  IF c.status <> 'DRAFT' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.case.record', false, 'CASE_NOT_DRAFT', c.office_id, NULL, p_case::text);
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

-- Dòng sổ để xuất: chỉ hồ sơ/giấy tờ đã ghi sổ mà người xem được quyền đọc (cùng luật hiển thị như danh sách).
CREATE FUNCTION dms_book_rows(p_tenant uuid, p_actor uuid, p_office uuid, p_book text, p_year integer, p_limit integer, p_offset integer)
RETURNS TABLE (stt integer, case_id uuid, document_id uuid, case_title text, case_attributes jsonb,
               doc_kind text, doc_title text, doc_attributes jsonb, recorded_at timestamptz)
LANGUAGE plpgsql AS $$
BEGIN
  IF p_book IS NULL OR p_book NOT IN ('S-01', 'S-02', 'S-04', 'S-05') THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.book.export', false, 'INVALID_INPUT', p_office, NULL, p_book);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.book.export', true, 'ALLOWED', p_office, NULL, p_book || '/' || coalesce(p_year::text, ''));
  RETURN QUERY
    SELECT e.stt, e.case_id, e.document_id, c.title, c.attributes, d.kind, d.title, d.attributes, c.recorded_at
    FROM dms_book_entries e
    JOIN dms_case_files c ON c.id = e.case_id AND c.tenant_id = e.tenant_id
    LEFT JOIN dms_documents d ON d.id = e.document_id AND d.tenant_id = e.tenant_id
    WHERE e.tenant_id = p_tenant AND e.office_id = p_office AND e.book = p_book AND e.year = p_year
      AND dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by)
    ORDER BY e.stt
    LIMIT greatest(1, least(coalesce(p_limit, 500), 2000)) OFFSET greatest(0, coalesce(p_offset, 0));
END $$;
