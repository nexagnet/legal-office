-- Tống đạt (S-01) theo mẫu sổ: MỘT hồ sơ = MỘT văn bản cần tống đạt = MỘT dòng sổ, giống Vi bằng, Xác minh THA, Tổ chức THA
-- (chủ dự án chốt 13/11/2026). Các cột sổ S-01 là thuộc tính của HỒ SƠ; tài liệu chỉ là tệp đính kèm.
--   * "Xác nhận lưu chính thức": cấp MỘT STT sổ S-01 (theo văn phòng, năm VN) và số hồ sơ = STT (005/2026/TĐ-TPL), như 3 nghiệp vụ kia.
--     Không còn bộ đếm riêng `dms_case_number_counters` cho Tống đạt (bảng giữ lại để không mất lịch sử).
--   * Thêm tài liệu vào hồ sơ đã ghi sổ không tạo dòng sổ nữa.
--   * "Chưa tống đạt" (thẻ số và cờ open_flag): hồ sơ chưa có thuộc tính hồ sơ `ngay_tong_dat` (giá trị hiện hành sau sửa đổi).
--   * Dữ liệu cũ (nhiều dòng sổ theo giấy tờ) không đổi, vẫn đọc được: sổ lấy thuộc tính hồ sơ, thiếu thì dùng thuộc tính giấy tờ.
--   * Dựng lại chỉ mục hồ sơ (open_flag) ở lần tìm kiếm đầu tiên của mỗi tenant (phiên bản chỉ mục 3).

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
  IF book IS NOT NULL THEN
    stt := dms_book_allocate(p_tenant, p_actor, c.office_id, book, p_case, NULL);
    num := dms_case_number_format(stt, dms_vn_year(), c.domain);
  END IF;
  UPDATE dms_case_files SET status = 'RECORDED', recorded_by = p_actor, recorded_at = now(), case_number = num
   WHERE id = p_case AND tenant_id = p_tenant;
  PERFORM dms_audit_rec(p_tenant, c.office_id, p_actor, 'dms.case.record', 'case', p_case,
                        jsonb_build_object('documents_recorded', n, 'case_number', num));
  RETURN vibang_audit(p_tenant, p_actor, 'dms.case.record', true, 'CASE_RECORDED', c.office_id, NULL, p_case::text);
END $$;

CREATE OR REPLACE FUNCTION dms_domain_pending_counts(p_tenant uuid, p_actor uuid, p_office uuid, p_year integer)
RETURNS TABLE (domain text, pending integer)
LANGUAGE plpgsql AS $$
BEGIN
  IF p_year IS NULL OR p_year NOT BETWEEN 2000 AND 2100 THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.report.pending', false, 'INVALID_INPUT', p_office, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.report.pending', true, 'ALLOWED', p_office, NULL, p_year::text);
  RETURN QUERY
    SELECT 'tongdat'::text,
           (SELECT count(*)::integer FROM dms_case_files c
             WHERE c.tenant_id = p_tenant AND c.office_id = p_office AND c.domain = 'tongdat' AND c.status = 'RECORDED'
               AND btrim(coalesce((SELECT e.attributes->>'ngay_tong_dat' FROM dms_case_effective(c.tenant_id, c.id) e), '')) = ''
               AND extract(year FROM c.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer = p_year
               AND dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by, c.branch_id))
    UNION ALL
    SELECT 'xacminh'::text,
           (SELECT count(*)::integer FROM dms_case_files c
             WHERE c.tenant_id = p_tenant AND c.office_id = p_office AND c.domain = 'xacminh' AND c.status = 'RECORDED'
               AND btrim(coalesce(c.attributes->>'ket_qua_xac_minh', '')) = ''
               AND extract(year FROM c.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer = p_year
               AND dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by, c.branch_id))
    UNION ALL
    SELECT 'tochuc'::text,
           (SELECT count(*)::integer FROM dms_case_files c
             WHERE c.tenant_id = p_tenant AND c.office_id = p_office AND c.domain = 'tochuc' AND c.status = 'RECORDED'
               AND NOT EXISTS (SELECT 1 FROM dms_documents x WHERE x.case_id = c.id AND x.tenant_id = c.tenant_id
                                 AND x.status <> 'CANCELLED' AND x.kind ILIKE '%N-08%')
               AND extract(year FROM c.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer = p_year
               AND dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by, c.branch_id));
END $$;

CREATE OR REPLACE FUNCTION dms_case_index_refresh(p_tenant uuid, p_case uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c dms_case_files; ce record;
BEGIN
  SELECT * INTO c FROM dms_case_files WHERE id = p_case AND tenant_id = p_tenant;
  IF NOT FOUND THEN RETURN; END IF;
  -- Tìm theo giá trị HIỆN HÀNH (sau sửa đổi đã duyệt), đúng như danh sách và sổ hiển thị.
  SELECT * INTO ce FROM dms_case_effective(p_tenant, p_case);
  INSERT INTO dms_case_index AS i (case_id, tenant_id, office_id, domain, status, branch_id, created_by, created_at, recorded_at, sort_at,
                                   rec_year, doc_count, scan_count, doc_kinds, pending_count, search_text,
                                   thv_user_id, returned, open_flag)
  SELECT c.id, c.tenant_id, c.office_id, c.domain, c.status, c.branch_id, c.created_by, c.created_at, c.recorded_at,
         coalesce(c.recorded_at, c.created_at),
         CASE WHEN c.recorded_at IS NULL THEN NULL ELSE extract(year FROM c.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer END,
         (SELECT count(*)::integer FROM dms_documents d WHERE d.tenant_id = c.tenant_id AND d.case_id = c.id AND d.status <> 'CANCELLED'),
         (SELECT count(*)::integer FROM dms_document_files f JOIN dms_documents d ON d.id = f.document_id AND d.tenant_id = f.tenant_id
           WHERE f.tenant_id = c.tenant_id AND d.case_id = c.id AND d.status <> 'CANCELLED' AND f.is_scan AND f.deleted_at IS NULL),
         coalesce((SELECT array_agg(DISTINCT d.kind ORDER BY d.kind) FROM dms_documents d
                    WHERE d.tenant_id = c.tenant_id AND d.case_id = c.id AND d.status <> 'CANCELLED'), '{}'::text[]),
         (SELECT count(*)::integer FROM dms_amendment_requests a WHERE a.tenant_id = c.tenant_id AND a.case_id = c.id AND a.status = 'PENDING'),
         dms_fold(left(concat_ws(' ', ce.title,
                  (SELECT string_agg(e.value, ' ') FROM jsonb_each_text(ce.attributes) e),
                  (SELECT string_agg(d.title || ' ' || coalesce((SELECT string_agg(e.value, ' ') FROM jsonb_each_text(dms_doc_effective_attrs(d.tenant_id, d.id)) e), ''), ' ')
                     FROM (SELECT * FROM dms_documents x WHERE x.tenant_id = c.tenant_id AND x.case_id = c.id AND x.status <> 'CANCELLED'
                            ORDER BY x.created_at, x.id LIMIT 50) d)), 6000)),
         c.thv_user_id,
         coalesce((SELECT r.returned FROM dms_case_returned r WHERE r.tenant_id = c.tenant_id AND r.case_id = c.id), false),
         CASE c.domain
           WHEN 'tongdat' THEN btrim(coalesce(ce.attributes->>'ngay_tong_dat', '')) = ''
           WHEN 'xacminh' THEN btrim(coalesce(c.attributes->>'ket_qua_xac_minh', '')) = ''
           WHEN 'tochuc' THEN NOT EXISTS (SELECT 1 FROM dms_documents x WHERE x.tenant_id = c.tenant_id AND x.case_id = c.id
                                            AND x.status <> 'CANCELLED' AND x.kind ILIKE '%N-08%')
           ELSE false
         END
  ON CONFLICT (case_id) DO UPDATE SET
    office_id = EXCLUDED.office_id, domain = EXCLUDED.domain, status = EXCLUDED.status, branch_id = EXCLUDED.branch_id,
    created_by = EXCLUDED.created_by, created_at = EXCLUDED.created_at, recorded_at = EXCLUDED.recorded_at, sort_at = EXCLUDED.sort_at,
    rec_year = EXCLUDED.rec_year, doc_count = EXCLUDED.doc_count, scan_count = EXCLUDED.scan_count, doc_kinds = EXCLUDED.doc_kinds,
    pending_count = EXCLUDED.pending_count, search_text = EXCLUDED.search_text,
    thv_user_id = EXCLUDED.thv_user_id, returned = EXCLUDED.returned, open_flag = EXCLUDED.open_flag;
END $$;

CREATE OR REPLACE FUNCTION dms_index_ensure(p_tenant uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v integer;
BEGIN
  IF EXISTS (SELECT 1 FROM dms_index_state WHERE tenant_id = p_tenant AND version >= 3) THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dms_index_ensure:' || p_tenant::text, 0));
  SELECT version INTO v FROM dms_index_state WHERE tenant_id = p_tenant;
  IF v >= 3 THEN RETURN; END IF;
  PERFORM dms_case_index_refresh(p_tenant, c.id) FROM dms_case_files c WHERE c.tenant_id = p_tenant;
  IF v IS NULL THEN
    PERFORM dms_osi_sync_row(r.tenant_id, r.version_id) FROM dms_ocr_results r WHERE r.tenant_id = p_tenant AND r.status = 'DONE';
    INSERT INTO dms_index_state (tenant_id, version) VALUES (p_tenant, 3) ON CONFLICT (tenant_id) DO UPDATE SET version = 3;
  ELSE
    UPDATE dms_index_state SET version = 3 WHERE tenant_id = p_tenant;
  END IF;
END $$;

-- Số hồ sơ Tống đạt = STT S-01 nên không còn nhập số cuối riêng cho bộ đếm `CASE-TD` (dòng nhật ký cũ của bảng dms_number_imports giữ nguyên).
CREATE OR REPLACE FUNCTION dms_import_last_number(p_tenant uuid, p_actor uuid, p_office uuid, p_kind text, p_year integer, p_last integer)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE denied text; prev integer;
BEGIN
  denied := vibang_actor_check(p_tenant, p_actor, p_office, NULL, 'ADMIN', false);
  IF denied IS NOT NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.number.import', false,
                        CASE WHEN denied = 'ROLE_LACKS_PERMISSION' THEN 'ADMIN_ONLY' ELSE denied END, p_office, NULL, NULL);
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('S-01', 'S-02', 'S-04', 'S-05')
     OR p_year IS NULL OR p_year NOT BETWEEN 2000 AND 2100 OR p_last IS NULL OR p_last < 0 THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.number.import', false, 'INVALID_NUMBER', p_office, NULL, NULL);
  END IF;
  SELECT last_value INTO prev FROM dms_book_counters
   WHERE tenant_id = p_tenant AND office_id = p_office AND book = p_kind AND year = p_year FOR UPDATE;
  IF FOUND AND prev > p_last THEN
    RETURN vibang_audit(p_tenant, p_actor, 'dms.number.import', false, 'WOULD_MOVE_BACKWARDS', p_office, NULL, NULL);
  END IF;
  IF p_last >= 1 THEN
    INSERT INTO dms_book_counters (tenant_id, office_id, book, year, last_value) VALUES (p_tenant, p_office, p_kind, p_year, p_last)
    ON CONFLICT (tenant_id, office_id, book, year) DO UPDATE SET last_value = EXCLUDED.last_value;
  END IF;
  INSERT INTO dms_number_imports (tenant_id, office_id, kind, year, previous_value, imported_value, actor_user_id)
  VALUES (p_tenant, p_office, p_kind, p_year, coalesce(prev, 0), p_last, p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'dms.number.import', true, 'ALLOWED', p_office, NULL, p_kind);
END $$;

CREATE OR REPLACE FUNCTION dms_number_status(p_tenant uuid, p_actor uuid, p_office uuid, p_year integer)
RETURNS TABLE (kind text, last_value integer, imported_value integer, imported_at timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT k.kind,
         coalesce((SELECT c.last_value FROM dms_book_counters c
                    WHERE c.tenant_id = p_tenant AND c.office_id = p_office AND c.book = k.kind AND c.year = p_year), 0),
         i.imported_value, i.at
    FROM (VALUES ('S-01'), ('S-02'), ('S-04'), ('S-05')) AS k(kind)
    LEFT JOIN LATERAL (
      SELECT n.imported_value, n.at FROM dms_number_imports n
       WHERE n.tenant_id = p_tenant AND n.office_id = p_office AND n.kind = k.kind AND n.year = p_year
       ORDER BY n.at DESC, n.id DESC LIMIT 1
    ) i ON true
   WHERE vibang_actor_check(p_tenant, p_actor, p_office, NULL, 'ADMIN', false) IS NULL
$$;
