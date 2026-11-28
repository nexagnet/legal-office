-- Trình / Duyệt: không bắt buộc có bản scan mới được tạo bản trình (chủ dự án yêu cầu 28/11/2026).
-- Chỉ sửa hàm tạo: không có tệp thì không gọi bước gắn tệp (bước đó vẫn từ chối danh sách rỗng khi tải thêm scan).

CREATE OR REPLACE FUNCTION dms_submission_create(p_tenant uuid, p_actor uuid, p_office uuid, p_title text, p_description text, p_case uuid,
                                      p_staged uuid[], p_labels text[])
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c dms_case_files; new_id uuid; err text;
BEGIN
  IF p_office IS NULL OR NOT dms_office_member(p_tenant, p_actor, p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.submission.create', false, 'PERMISSION_DENIED', p_office, NULL, NULL);
  END IF;
  IF btrim(coalesce(p_title, '')) = '' OR char_length(p_title) > 300 OR char_length(coalesce(p_description, '')) > 5000 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.submission.create', false, 'INVALID_INPUT', p_office, NULL, NULL);
  END IF;
  IF p_case IS NOT NULL THEN
    SELECT * INTO c FROM dms_case_files WHERE id = p_case AND tenant_id = p_tenant;
    IF NOT FOUND OR c.office_id <> p_office
       OR NOT dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by, c.branch_id) THEN
      RETURN vibang_audit(p_tenant, p_actor, 'dms.submission.create', false, 'CASE_NOT_FOUND', p_office, NULL, NULL);
    END IF;
  END IF;
  new_id := gen_random_uuid();
  INSERT INTO dms_submissions (id, tenant_id, office_id, title, description, case_id, submitted_by)
  VALUES (new_id, p_tenant, p_office, btrim(p_title), btrim(coalesce(p_description, '')), p_case, p_actor);
  -- Từ 28/11/2026 bản scan không bắt buộc: không có tệp thì chỉ ghi tiêu đề, mô tả (scan tải thêm sau được).
  IF coalesce(cardinality(p_staged), 0) > 0 THEN
    err := dms_submission_attach_files(p_tenant, p_actor, new_id, p_staged, p_labels);
  END IF;
  IF err IS NOT NULL THEN
    -- Chưa có tệp nào được gắn nhưng bản trình đã ghi: huỷ bằng ngoại lệ có chủ đích để khối con hoàn tác, rồi trả mã lỗi.
    RAISE EXCEPTION 'submission_attach_failed:%', err USING ERRCODE = 'P0001';
  END IF;
  PERFORM dms_audit_rec(p_tenant, p_office, p_actor, 'dms.submission.create', 'submission', new_id,
                        jsonb_build_object('files', coalesce(cardinality(p_staged), 0), 'case_id', p_case));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.submission.create', true, 'SUBMISSION_CREATED', p_office, NULL, new_id::text);
EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM LIKE 'submission_attach_failed:%' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.submission.create', false, substring(SQLERRM FROM 'submission_attach_failed:(.*)$'), p_office, NULL, NULL);
  END IF;
  RAISE;
END $$;

-- Văn thư (vtden|vtdi|vtnb) không tải được tệp scan: hàm "Tài liệu khác" (0109) tạo sau 0078 nên chỉ nhận 4 nghiệp vụ và trả INVALID_DOMAIN
-- cho 3 sổ Văn thư. Thêm 3 miền Văn thư; quyền vẫn do dms_case_load kiểm theo Nhóm quyền của từng miền.

CREATE OR REPLACE FUNCTION dms_document_other_ensure(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE l record; c dms_case_files; existing uuid;
BEGIN
  SELECT * INTO l FROM dms_case_load(p_tenant, p_actor, p_case, 'dms.document.other', 'add_document');
  IF l.denied IS NOT NULL THEN RETURN ROW(false, l.denied, NULL)::vibang_op; END IF;
  c := l.c;
  IF c.domain NOT IN ('vibang', 'tongdat', 'xacminh', 'tochuc', 'vtden', 'vtdi', 'vtnb') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.document.other', false, 'INVALID_DOMAIN', c.office_id, NULL, p_case::text);
  END IF;
  IF c.status = 'CANCELLED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.document.other', false, 'CASE_CANCELLED', c.office_id, NULL, p_case::text);
  END IF;
  -- Hai lần gọi đồng thời cho cùng hồ sơ phải ra cùng một tài liệu.
  PERFORM pg_advisory_xact_lock(hashtextextended('dms_other_doc:' || p_case::text, 0));
  SELECT d.id INTO existing FROM dms_documents d
   WHERE d.tenant_id = p_tenant AND d.case_id = p_case AND d.kind = 'Tài liệu khác' AND d.status <> 'CANCELLED'
   ORDER BY d.created_at, d.id LIMIT 1;
  IF existing IS NOT NULL THEN
    RETURN ROW(true, 'DOCUMENT_ADDED', existing::text)::vibang_op;
  END IF;
  RETURN dms_document_add(p_tenant, p_actor, p_case, 'Tài liệu khác', 'Tài liệu khác', false, NULL);
END $$;
