-- DMS: OCR + tìm toàn văn cho TÀI LIỆU CŨ tải lên từ giao diện (từng tệp một).
-- Không đụng bảng bất biến dms_legacy_files. Kết quả OCR nằm ở bảng riêng, khoá theo NỘI DUNG (văn phòng + sha256):
-- nhiều tệp trùng nội dung chỉ OCR một lần. Chỉ đợt đánh dấu ocr = true (đợt tải từ giao diện) mới vào hàng đợi OCR;
-- đợt nhập hàng loạt bằng lo-import mặc định KHÔNG OCR (OCR 200 GB phải chạy riêng trên máy mạnh, xem kế hoạch).
-- Quyền: tải lên cần dms.legacy.import; xem trạng thái cần import hoặc read; tìm cần dms.legacy.read.

ALTER TABLE dms_legacy_batches ADD COLUMN ocr boolean NOT NULL DEFAULT false;

-- Thêm tham số p_ocr (mặc định false) cho hàm mở đợt. Xoá chữ ký cũ để lời gọi 5 tham số không bị nhập nhằng.
DROP FUNCTION dms_legacy_batch_open(uuid, uuid, uuid, text, text);
CREATE FUNCTION dms_legacy_batch_open(p_tenant uuid, p_actor uuid, p_office uuid, p_label text, p_source_root text,
                                      p_ocr boolean DEFAULT false)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE new_id uuid;
BEGIN
  IF NOT dms_has_permission(p_tenant, p_actor, p_office, 'dms.legacy.import') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.legacy.batch_open', false, 'PERMISSION_DENIED', p_office, NULL, NULL);
  END IF;
  IF btrim(coalesce(p_label, '')) = '' OR char_length(p_label) > 200 OR char_length(coalesce(p_source_root, '')) > 300 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.legacy.batch_open', false, 'INVALID_INPUT', p_office, NULL, NULL);
  END IF;
  INSERT INTO dms_legacy_batches (tenant_id, office_id, label, source_root, created_by, ocr)
  VALUES (p_tenant, p_office, btrim(p_label), nullif(btrim(coalesce(p_source_root, '')), ''), p_actor, coalesce(p_ocr, false))
  RETURNING id INTO new_id;
  PERFORM dms_audit_rec(p_tenant, p_office, p_actor, 'dms.legacy.batch_open', 'legacy_batch', new_id,
                        jsonb_build_object('ocr', coalesce(p_ocr, false)));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.legacy.batch_open', true, 'LEGACY_BATCH_OPENED', p_office, NULL, new_id::text);
END $$;

-- ===== Kết quả OCR theo nội dung =====
CREATE TABLE dms_legacy_ocr (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  object_key text NOT NULL CHECK (btrim(object_key) <> ''),
  mime text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'SKIPPED')),
  engine text,
  lang text,
  attempts integer NOT NULL DEFAULT 0,
  page_count integer,
  confidence numeric(5, 2),
  ocr_text text,
  search_text text,
  tsv tsvector,
  error text,
  claimed_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dms_legacy_ocr_content_uq UNIQUE (tenant_id, office_id, sha256),
  CONSTRAINT dms_legacy_ocr_office_fk FOREIGN KEY (office_id, tenant_id) REFERENCES offices (id, tenant_id)
);
CREATE INDEX dms_legacy_ocr_status_idx ON dms_legacy_ocr (tenant_id, status, created_at);
CREATE INDEX dms_legacy_ocr_tsv_idx ON dms_legacy_ocr USING gin (tsv);
-- Cố ý KHÔNG FORCE RLS (như dms_ocr_search_index): hàm tìm là SECURITY DEFINER để dùng được chỉ mục GIN. Vai ứng dụng vẫn chịu RLS.
ALTER TABLE dms_legacy_ocr ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dms_legacy_ocr
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- Nhận một việc. Trước hết xếp hàng các tệp của đợt ocr chưa có dòng (tối đa 500 mỗi lần gọi), rồi giành một dòng PENDING
-- (hoặc RUNNING quá 15 phút). Quá 3 lần thử thì FAILED. Định dạng không phải PDF/ảnh, hoặc quá 100 MB thì SKIPPED (kèm mã lý do).
CREATE FUNCTION dms_legacy_ocr_claim(p_tenant uuid)
RETURNS TABLE (id uuid, object_key text, mime text)
LANGUAGE plpgsql AS $$
DECLARE picked uuid;
BEGIN
  INSERT INTO dms_legacy_ocr (tenant_id, office_id, sha256, object_key, mime, size_bytes, status, error, finished_at)
  SELECT p_tenant, q.office_id, q.sha256, q.object_key, q.mime, q.size_bytes,
         CASE WHEN (q.mime = 'application/pdf' OR q.mime LIKE 'image/%') AND q.size_bytes <= 104857600 THEN 'PENDING' ELSE 'SKIPPED' END,
         CASE WHEN q.mime = 'application/pdf' OR q.mime LIKE 'image/%' THEN
                CASE WHEN q.size_bytes > 104857600 THEN 'TOO_LARGE' END
              ELSE 'UNSUPPORTED_TYPE' END,
         CASE WHEN (q.mime = 'application/pdf' OR q.mime LIKE 'image/%') AND q.size_bytes <= 104857600 THEN NULL ELSE now() END
  FROM (
    SELECT DISTINCT ON (f.office_id, f.sha256) f.office_id, f.sha256, f.object_key, f.mime, f.size_bytes
    FROM dms_legacy_files f
    JOIN dms_legacy_batches b ON b.id = f.batch_id AND b.tenant_id = f.tenant_id AND b.ocr
    WHERE f.tenant_id = p_tenant
      AND NOT EXISTS (SELECT 1 FROM dms_legacy_ocr r WHERE r.tenant_id = f.tenant_id AND r.office_id = f.office_id AND r.sha256 = f.sha256)
    ORDER BY f.office_id, f.sha256, f.created_at
    LIMIT 500
  ) q
  ON CONFLICT ON CONSTRAINT dms_legacy_ocr_content_uq DO NOTHING;

  UPDATE dms_legacy_ocr r SET status = 'FAILED', finished_at = now(), error = coalesce(r.error, 'ATTEMPTS_EXCEEDED')
  WHERE r.tenant_id = p_tenant AND r.attempts >= 3
    AND (r.status = 'PENDING' OR (r.status = 'RUNNING' AND r.claimed_at < now() - interval '15 minutes'));

  SELECT r.id INTO picked FROM dms_legacy_ocr r
  WHERE r.tenant_id = p_tenant
    AND (r.status = 'PENDING' OR (r.status = 'RUNNING' AND r.claimed_at < now() - interval '15 minutes'))
  ORDER BY r.created_at, r.id
  LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF picked IS NULL THEN RETURN; END IF;

  UPDATE dms_legacy_ocr r SET status = 'RUNNING', claimed_at = now(), attempts = r.attempts + 1, error = NULL
  WHERE r.id = picked;
  RETURN QUERY SELECT r.id, r.object_key, r.mime FROM dms_legacy_ocr r WHERE r.id = picked;
END $$;

CREATE FUNCTION dms_legacy_ocr_complete(p_tenant uuid, p_id uuid, p_engine text, p_lang text, p_pages integer,
                                        p_confidence numeric, p_text text, p_search text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  UPDATE dms_legacy_ocr SET status = 'DONE', engine = p_engine, lang = p_lang, page_count = p_pages,
         confidence = p_confidence, ocr_text = p_text, search_text = p_search,
         tsv = to_tsvector('simple', coalesce(p_search, '')), error = NULL, finished_at = now()
  WHERE id = p_id AND tenant_id = p_tenant AND status = 'RUNNING';
  RETURN FOUND;
END $$;

-- Lỗi: còn lượt thì về PENDING để thử lại, hết lượt thì FAILED. error chỉ là mã ngắn, không chứa nội dung tệp.
CREATE FUNCTION dms_legacy_ocr_fail(p_tenant uuid, p_id uuid, p_error text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  UPDATE dms_legacy_ocr
  SET status = CASE WHEN attempts >= 3 THEN 'FAILED' ELSE 'PENDING' END,
      error = left(coalesce(p_error, 'UNKNOWN'), 120),
      finished_at = CASE WHEN attempts >= 3 THEN now() ELSE NULL END
  WHERE id = p_id AND tenant_id = p_tenant AND status = 'RUNNING';
  RETURN FOUND;
END $$;

-- ===== Trạng thái OCR của một nhóm tệp (giao diện tải lên và danh sách) =====
-- Tệp thuộc đợt không OCR và chưa có dòng thì 'NONE'; thuộc đợt OCR mà chưa có dòng thì 'PENDING'.
CREATE FUNCTION dms_legacy_ocr_status(p_tenant uuid, p_actor uuid, p_office uuid, p_ids uuid[])
RETURNS TABLE (file_id uuid, status text, page_count integer, error text)
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT (dms_has_permission(p_tenant, p_actor, p_office, 'dms.legacy.import')
          OR dms_has_permission(p_tenant, p_actor, p_office, 'dms.legacy.read')) THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.legacy.ocr_status', false, 'PERMISSION_DENIED', p_office, NULL, NULL);
    RETURN;
  END IF;
  RETURN QUERY
    SELECT f.id, coalesce(r.status, CASE WHEN b.ocr THEN 'PENDING' ELSE 'NONE' END), r.page_count, r.error
    FROM dms_legacy_files f
    JOIN dms_legacy_batches b ON b.id = f.batch_id AND b.tenant_id = f.tenant_id
    LEFT JOIN dms_legacy_ocr r ON r.tenant_id = f.tenant_id AND r.office_id = f.office_id AND r.sha256 = f.sha256
    WHERE f.tenant_id = p_tenant AND f.office_id = p_office AND f.id = ANY (p_ids[1:200]);
END $$;

-- ===== Tìm toàn văn trong tài liệu cũ =====
-- p_tsquery do ứng dụng dựng từ từ khoá đã bỏ dấu (như dms_ocr_search). Cần dms.legacy.read, ghi nhật ký (không chứa từ khoá).
CREATE FUNCTION dms_legacy_search(p_tenant uuid, p_actor uuid, p_office uuid, p_tsquery text, p_limit integer, p_offset integer)
RETURNS TABLE (id uuid, rel_path text, file_name text, size_bytes bigint, mime text, created_at timestamptz,
               rank real, page_count integer, ocr_text text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE q tsquery;
BEGIN
  IF p_tenant IS NULL OR p_tenant::text IS DISTINCT FROM current_setting('app.tenant_id', true) THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT dms_has_permission(p_tenant, p_actor, p_office, 'dms.legacy.read') THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.legacy.search', false, 'PERMISSION_DENIED', p_office, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.legacy.search', true, 'ALLOWED', p_office, NULL, NULL);
  IF btrim(coalesce(p_tsquery, '')) = '' THEN RETURN; END IF;
  q := to_tsquery('simple', p_tsquery);
  RETURN QUERY
    SELECT f.id, f.rel_path, f.file_name, f.size_bytes, f.mime, f.created_at, m.rank, m.page_count, m.ocr_text
    FROM (SELECT r.sha256, ts_rank(r.tsv, q) AS rank, r.page_count, r.ocr_text
            FROM dms_legacy_ocr r
           WHERE r.tenant_id = p_tenant AND r.office_id = p_office AND r.status = 'DONE' AND r.tsv @@ q
           ORDER BY 2 DESC, r.sha256
           LIMIT greatest(1, least(coalesce(p_limit, 20), 50)) OFFSET greatest(0, coalesce(p_offset, 0))) m
    JOIN dms_legacy_files f ON f.tenant_id = p_tenant AND f.office_id = p_office AND f.sha256 = m.sha256
    ORDER BY m.rank DESC, f.rel_path COLLATE "C", f.id;
END $$;
