-- DMS Phase 6: OCR chỉ để TÌM KIẾM toàn văn. Văn bản nhận dạng nằm ở bảng riêng, không bao giờ ghi đè trường hồ sơ.
-- Mỗi phiên bản tệp có tối đa một dòng OCR. Worker (dịch vụ lo-ocr) nhận việc qua hàm dms_ocr_claim, chạy bằng vai ứng dụng
-- trong ngữ cảnh tenant nên RLS vẫn áp dụng. Không dùng extension unaccent (host có thể không cho CREATE EXTENSION):
-- văn bản được bỏ dấu ở tầng ứng dụng và lưu vào search_text.
ALTER TABLE dms_document_versions ADD CONSTRAINT dms_document_versions_id_tenant_uq UNIQUE (id, tenant_id);

CREATE TABLE dms_ocr_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  version_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'SKIPPED')),
  engine text,
  lang text,
  attempts integer NOT NULL DEFAULT 0,
  page_count integer,
  confidence numeric(5, 2),
  ocr_text text,
  search_text text,
  error text,
  claimed_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dms_ocr_version_uq UNIQUE (tenant_id, version_id),
  CONSTRAINT dms_ocr_version_fk FOREIGN KEY (version_id, tenant_id) REFERENCES dms_document_versions (id, tenant_id)
);
CREATE INDEX dms_ocr_status_idx ON dms_ocr_results (tenant_id, status, created_at);
CREATE INDEX dms_ocr_fts_idx ON dms_ocr_results USING gin (to_tsvector('simple', coalesce(search_text, '')));
ALTER TABLE dms_ocr_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_ocr_results FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dms_ocr_results
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- Nhận một việc: tạo dòng PENDING cho phiên bản ảnh/PDF chưa có dòng, rồi giành một dòng PENDING (hoặc RUNNING quá 15 phút).
-- Quá 3 lần thử thì đánh dấu FAILED, không thử lại vô hạn. Phiên bản định dạng khác thì SKIPPED.
CREATE FUNCTION dms_ocr_claim(p_tenant uuid)
RETURNS TABLE (id uuid, version_id uuid, object_key text, mime text)
LANGUAGE plpgsql AS $$
DECLARE picked uuid;
BEGIN
  INSERT INTO dms_ocr_results (tenant_id, version_id, status, finished_at)
  SELECT v.tenant_id, v.id,
         CASE WHEN v.mime = 'application/pdf' OR v.mime LIKE 'image/%' THEN 'PENDING' ELSE 'SKIPPED' END,
         CASE WHEN v.mime = 'application/pdf' OR v.mime LIKE 'image/%' THEN NULL ELSE now() END
  FROM dms_document_versions v
  WHERE v.tenant_id = p_tenant
    AND NOT EXISTS (SELECT 1 FROM dms_ocr_results r WHERE r.tenant_id = v.tenant_id AND r.version_id = v.id)
  ON CONFLICT ON CONSTRAINT dms_ocr_version_uq DO NOTHING;

  UPDATE dms_ocr_results r SET status = 'FAILED', finished_at = now(), error = coalesce(r.error, 'ATTEMPTS_EXCEEDED')
  WHERE r.tenant_id = p_tenant AND r.attempts >= 3
    AND (r.status = 'PENDING' OR (r.status = 'RUNNING' AND r.claimed_at < now() - interval '15 minutes'));

  SELECT r.id INTO picked FROM dms_ocr_results r
  WHERE r.tenant_id = p_tenant
    AND (r.status = 'PENDING' OR (r.status = 'RUNNING' AND r.claimed_at < now() - interval '15 minutes'))
  ORDER BY r.created_at, r.id
  LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF picked IS NULL THEN RETURN; END IF;

  UPDATE dms_ocr_results r SET status = 'RUNNING', claimed_at = now(), attempts = r.attempts + 1, error = NULL
  WHERE r.id = picked;
  RETURN QUERY
    SELECT r.id, r.version_id, v.object_key, v.mime
    FROM dms_ocr_results r JOIN dms_document_versions v ON v.id = r.version_id AND v.tenant_id = r.tenant_id
    WHERE r.id = picked;
END $$;

CREATE FUNCTION dms_ocr_complete(p_tenant uuid, p_id uuid, p_engine text, p_lang text, p_pages integer,
                                 p_confidence numeric, p_text text, p_search text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  UPDATE dms_ocr_results SET status = 'DONE', engine = p_engine, lang = p_lang, page_count = p_pages,
         confidence = p_confidence, ocr_text = p_text, search_text = p_search, error = NULL, finished_at = now()
  WHERE id = p_id AND tenant_id = p_tenant AND status = 'RUNNING';
  RETURN FOUND;
END $$;

-- Lỗi: còn lượt thì về PENDING để thử lại, hết lượt thì FAILED. error chỉ là mã ngắn, không chứa nội dung tệp.
CREATE FUNCTION dms_ocr_fail(p_tenant uuid, p_id uuid, p_error text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  UPDATE dms_ocr_results
  SET status = CASE WHEN attempts >= 3 THEN 'FAILED' ELSE 'PENDING' END,
      error = left(coalesce(p_error, 'UNKNOWN'), 120),
      finished_at = CASE WHEN attempts >= 3 THEN now() ELSE NULL END
  WHERE id = p_id AND tenant_id = p_tenant AND status = 'RUNNING';
  RETURN FOUND;
END $$;

-- Tìm toàn văn trong một văn phòng. Chỉ trả hồ sơ người gọi được xem (cùng dms_case_visible với danh sách hồ sơ),
-- tài liệu chưa hủy, và chỉ phiên bản MỚI NHẤT của mỗi tệp. p_tsquery do ứng dụng dựng từ từ khoá đã bỏ dấu.
CREATE FUNCTION dms_ocr_search(p_tenant uuid, p_actor uuid, p_office uuid, p_domain text, p_tsquery text, p_limit integer)
RETURNS TABLE (case_id uuid, case_title text, domain text, document_id uuid, document_title text, file_id uuid,
               file_label text, version integer, rank real, ocr_text text, search_text text)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.ocr.search', true, 'ALLOWED', p_office, NULL, p_domain);
  IF btrim(coalesce(p_tsquery, '')) = '' THEN RETURN; END IF;
  RETURN QUERY
    SELECT c.id, c.title, c.domain, d.id, d.title, f.id, f.label, v.version,
           ts_rank(to_tsvector('simple', coalesce(r.search_text, '')), to_tsquery('simple', p_tsquery)),
           r.ocr_text, r.search_text
    FROM dms_ocr_results r
    JOIN dms_document_versions v ON v.id = r.version_id AND v.tenant_id = r.tenant_id
    JOIN dms_document_files f ON f.id = v.file_id AND f.tenant_id = v.tenant_id
    JOIN dms_documents d ON d.id = f.document_id AND d.tenant_id = f.tenant_id
    JOIN dms_case_files c ON c.id = d.case_id AND c.tenant_id = d.tenant_id
    WHERE r.tenant_id = p_tenant AND r.status = 'DONE' AND c.office_id = p_office
      AND (p_domain IS NULL OR c.domain = p_domain)
      AND d.status <> 'CANCELLED' AND c.status <> 'CANCELLED'
      AND v.version = (SELECT max(v2.version) FROM dms_document_versions v2 WHERE v2.tenant_id = v.tenant_id AND v2.file_id = v.file_id)
      AND to_tsvector('simple', coalesce(r.search_text, '')) @@ to_tsquery('simple', p_tsquery)
      AND dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by)
    ORDER BY 9 DESC, c.created_at DESC, d.id
    LIMIT greatest(1, least(coalesce(p_limit, 20), 50));
END $$;
