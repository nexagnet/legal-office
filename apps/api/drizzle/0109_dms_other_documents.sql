-- Ô "Tài liệu khác" dùng chung cho 4 nghiệp vụ (vi bằng, tống đạt, xác minh THA, tổ chức THA).
-- Lý do: thực tế luôn có giấy tờ phát sinh chưa lường trước, mà hồ sơ đã ghi sổ chỉ cho tải THÊM tệp vào tài liệu có sẵn
-- (không sửa, không xóa), nên cần một tài liệu chung luôn sẵn sàng.
--   * dms_document_other_ensure: trả tài liệu "Tài liệu khác" của hồ sơ; chưa có thì tạo (hồ sơ nháp hoặc đã ghi sổ). Cùng quyền
--     add_document như thêm tài liệu / tải tệp. Gọi lại nhiều lần vẫn chỉ có MỘT tài liệu loại này cho mỗi hồ sơ.
--   * Tống đạt: mỗi giấy tờ là một dòng Sổ S-01, nhưng "Tài liệu khác" không phải giấy tờ cần tống đạt nên KHÔNG vào sổ
--     (cả khi thêm lúc đã ghi sổ lẫn khi ghi sổ hồ sơ nháp).
CREATE OR REPLACE FUNCTION dms_document_add(p_tenant uuid, p_actor uuid, p_case uuid, p_kind text, p_title text, p_is_official boolean, p_attributes jsonb DEFAULT NULL)
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
  IF c.status = 'RECORDED' AND c.domain = 'tongdat' AND btrim(p_kind) <> 'Tài liệu khác' THEN
    PERFORM dms_book_allocate(p_tenant, p_actor, c.office_id, 'S-01', p_case, new_id);
  END IF;
  PERFORM dms_audit_rec(p_tenant, c.office_id, p_actor, 'dms.document.add', 'document', new_id, jsonb_build_object('case_id', p_case, 'status', c.status));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.document.add', true, 'DOCUMENT_ADDED', c.office_id, NULL, new_id::text);
END $$;

CREATE OR REPLACE FUNCTION dms_case_record(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE l record; c dms_case_files; n integer; book text; d record; conf_hash text; stt integer; num text;
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
  book := dms_book_of(c.domain);
  IF book = 'S-01' THEN
    FOR d IN SELECT id FROM dms_documents
              WHERE case_id = p_case AND tenant_id = p_tenant AND status = 'RECORDED' AND kind <> 'Tài liệu khác'
              ORDER BY created_at, id LOOP
      PERFORM dms_book_allocate(p_tenant, p_actor, c.office_id, book, p_case, d.id);
    END LOOP;
    num := dms_case_number_format(dms_case_number_next_tongdat(p_tenant, c.office_id), dms_vn_year(), c.domain);
  ELSIF book IS NOT NULL THEN
    stt := dms_book_allocate(p_tenant, p_actor, c.office_id, book, p_case, NULL);
    num := dms_case_number_format(stt, dms_vn_year(), c.domain);
  END IF;
  UPDATE dms_case_files SET status = 'RECORDED', recorded_by = p_actor, recorded_at = now(), case_number = num
   WHERE id = p_case AND tenant_id = p_tenant;
  PERFORM dms_audit_rec(p_tenant, c.office_id, p_actor, 'dms.case.record', 'case', p_case,
                        jsonb_build_object('documents_recorded', n, 'case_number', num));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.case.record', true, 'CASE_RECORDED', c.office_id, NULL, p_case::text);
END $$;

CREATE FUNCTION dms_document_other_ensure(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE l record; c dms_case_files; existing uuid;
BEGIN
  SELECT * INTO l FROM dms_case_load(p_tenant, p_actor, p_case, 'dms.document.other', 'add_document');
  IF l.denied IS NOT NULL THEN RETURN ROW(false, l.denied, NULL)::vibang_op; END IF;
  c := l.c;
  IF c.domain NOT IN ('vibang', 'tongdat', 'xacminh', 'tochuc') THEN
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
