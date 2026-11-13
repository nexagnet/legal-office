-- Bộ lọc NGHIỆP VỤ cho danh sách 4 nghiệp vụ (chủ dự án duyệt 13/11/2026): hai cột chỉ mục giá trị thô của hồ sơ để lọc có đếm.
--   facet_a: Tống đạt = hình thức tống đạt; Vi bằng = tỉnh/thành (đoạn cuối "địa chỉ nơi lập"); Xác minh = kết quả xác minh;
--            Tổ chức = kết quả thi hành án.
--   facet_b: Tống đạt = cơ quan giao văn bản (Tòa án / Cơ quan THADS / Cơ quan kiểm sát); nghiệp vụ khác không dùng.
-- Tham số lọc mới trong p_extra: {"fa": "...", "fb": "..."} (so khớp đúng giá trị). Facet có đếm thêm hai nhóm `fa`, `fb`.
-- Dựng lại chỉ mục (phiên bản 4) ở lần tìm kiếm đầu của mỗi tenant.

ALTER TABLE dms_case_index ADD COLUMN facet_a text, ADD COLUMN facet_b text;
CREATE INDEX dms_ci_facet_a_idx ON dms_case_index (tenant_id, office_id, domain, status, facet_a, sort_at DESC, case_id DESC) WHERE facet_a IS NOT NULL;
CREATE INDEX dms_ci_facet_b_idx ON dms_case_index (tenant_id, office_id, domain, status, facet_b, sort_at DESC, case_id DESC) WHERE facet_b IS NOT NULL;

CREATE OR REPLACE FUNCTION dms_case_index_refresh(p_tenant uuid, p_case uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c dms_case_files; ce record;
BEGIN
  SELECT * INTO c FROM dms_case_files WHERE id = p_case AND tenant_id = p_tenant;
  IF NOT FOUND THEN RETURN; END IF;
  -- Tìm theo giá trị HIỆN HÀNH (sau sửa đổi đã duyệt), đúng như danh sách và sổ hiển thị.
  SELECT * INTO ce FROM dms_case_effective(p_tenant, p_case);
  INSERT INTO dms_case_index AS i (case_id, tenant_id, office_id, domain, status, branch_id, created_by, created_at, recorded_at, sort_at,
                                   rec_year, doc_count, scan_count, doc_kinds, pending_count, search_text,
                                   thv_user_id, returned, open_flag, facet_a, facet_b)
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
         END,
         -- Bộ lọc nghiệp vụ (0124): giá trị thô của hồ sơ, dùng cho ô chọn có đếm. Rỗng = NULL.
         nullif(btrim(CASE c.domain
           WHEN 'tongdat' THEN ce.attributes->>'hinh_thuc_tong_dat'
           WHEN 'vibang' THEN (regexp_split_to_array(coalesce(ce.attributes->>'dia_chi_noi_lap', ''), '\s*,\s*'))[
                                greatest(1, array_length(regexp_split_to_array(coalesce(ce.attributes->>'dia_chi_noi_lap', ''), '\s*,\s*'), 1))]
           WHEN 'xacminh' THEN ce.attributes->>'ket_qua_xac_minh'
           WHEN 'tochuc' THEN ce.attributes->>'ket_qua_thi_hanh_an'
         END), ''),
         nullif(btrim(CASE c.domain
           WHEN 'tongdat' THEN CASE WHEN btrim(coalesce(ce.attributes->>'co_quan_toa_an', '')) <> '' THEN 'Tòa án'
                                    WHEN btrim(coalesce(ce.attributes->>'co_quan_thads', '')) <> '' THEN 'Cơ quan THADS'
                                    WHEN btrim(coalesce(ce.attributes->>'co_quan_kiem_sat', '')) <> '' THEN 'Cơ quan kiểm sát' END
         END), '')
  ON CONFLICT (case_id) DO UPDATE SET
    office_id = EXCLUDED.office_id, domain = EXCLUDED.domain, status = EXCLUDED.status, branch_id = EXCLUDED.branch_id,
    created_by = EXCLUDED.created_by, created_at = EXCLUDED.created_at, recorded_at = EXCLUDED.recorded_at, sort_at = EXCLUDED.sort_at,
    rec_year = EXCLUDED.rec_year, doc_count = EXCLUDED.doc_count, scan_count = EXCLUDED.scan_count, doc_kinds = EXCLUDED.doc_kinds,
    pending_count = EXCLUDED.pending_count, search_text = EXCLUDED.search_text,
    thv_user_id = EXCLUDED.thv_user_id, returned = EXCLUDED.returned, open_flag = EXCLUDED.open_flag,
    facet_a = EXCLUDED.facet_a, facet_b = EXCLUDED.facet_b;
END $$;

CREATE OR REPLACE FUNCTION dms_ci_where(p_tenant uuid, p_actor uuid, p_office uuid, p_domain text, p_status text, p_q text, p_year integer,
                             p_from timestamptz, p_to timestamptz, p_branch uuid, p_creator uuid, p_kind text, p_scan text,
                             p_pending boolean, p_skip text DEFAULT NULL, p_extra jsonb DEFAULT NULL)
RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE w text; term text; n integer := 0; thv uuid[];
BEGIN
  w := format('ci.tenant_id = %L AND ci.office_id = %L AND ', p_tenant, p_office) || dms_ci_vis_sql(p_tenant, p_actor, p_office);
  IF p_domain IS NOT NULL THEN w := w || format(' AND ci.domain = %L', p_domain); END IF;
  IF p_status IS NULL THEN w := w || ' AND ci.status <> ''CANCELLED''';
  ELSE w := w || format(' AND ci.status = %L', p_status); END IF;
  IF p_year IS NOT NULL THEN w := w || format(' AND ci.rec_year = %s', p_year::integer); END IF;
  IF p_from IS NOT NULL THEN w := w || format(' AND ci.sort_at >= %L', p_from); END IF;
  IF p_to IS NOT NULL THEN w := w || format(' AND ci.sort_at < %L', p_to); END IF;
  IF coalesce(p_pending, false) THEN w := w || ' AND ci.pending_count > 0'; END IF;
  -- Từ khoá: đã bỏ dấu, chỉ [a-z0-9/.-] (không thể chèn ký tự đại diện LIKE), tối đa 6 từ; mọi từ phải có mặt (khớp chuỗi con).
  FOR term IN SELECT DISTINCT t FROM unnest(regexp_split_to_array(dms_fold(coalesce(p_q, '')), '[^a-z0-9/.-]+')) t WHERE t <> '' LOOP
    n := n + 1;
    EXIT WHEN n > 6;
    w := w || format(' AND ci.search_text LIKE %L', '%' || term || '%');
  END LOOP;
  IF p_branch IS NOT NULL AND p_skip IS DISTINCT FROM 'branch' THEN w := w || format(' AND ci.branch_id = %L', p_branch); END IF;
  IF p_creator IS NOT NULL AND p_skip IS DISTINCT FROM 'creator' THEN w := w || format(' AND ci.created_by = %L', p_creator); END IF;
  IF p_kind IS NOT NULL AND p_skip IS DISTINCT FROM 'kind' THEN w := w || format(' AND ci.doc_kinds @> ARRAY[%L]::text[]', p_kind); END IF;
  IF p_scan IS NOT NULL AND p_skip IS DISTINCT FROM 'scan' THEN
    w := w || CASE p_scan WHEN 'missing' THEN ' AND ci.doc_count > 0 AND ci.scan_count = 0'
                          WHEN 'complete' THEN ' AND ci.doc_count > 0 AND ci.scan_count > 0'
                          WHEN 'empty' THEN ' AND ci.doc_count = 0'
                          ELSE ' AND false' END;
  END IF;
  IF p_extra IS NOT NULL AND jsonb_typeof(p_extra) = 'object' THEN
    -- Thừa hành viên: một hoặc nhiều; phần tử không phải uuid làm hàm báo lỗi (API đã kiểm tra trước).
    IF jsonb_typeof(p_extra->'thv') = 'array' AND jsonb_array_length(p_extra->'thv') > 0 AND p_skip IS DISTINCT FROM 'thv' THEN
      thv := ARRAY(SELECT jsonb_array_elements_text(p_extra->'thv'))::uuid[];
      w := w || format(' AND ci.thv_user_id = ANY(%L::uuid[])', thv);
    END IF;
    IF jsonb_typeof(p_extra->'open') = 'boolean' AND p_skip IS DISTINCT FROM 'open' THEN
      w := w || format(' AND ci.open_flag = %L::boolean', (p_extra->>'open')::boolean);
    END IF;
    IF jsonb_typeof(p_extra->'returned') = 'boolean' AND p_skip IS DISTINCT FROM 'returned' THEN
      w := w || format(' AND ci.returned = %L::boolean', (p_extra->>'returned')::boolean);
    END IF;
    IF jsonb_typeof(p_extra->'fa') = 'string' AND p_skip IS DISTINCT FROM 'fa' THEN
      w := w || format(' AND ci.facet_a = %L', p_extra->>'fa');
    END IF;
    IF jsonb_typeof(p_extra->'fb') = 'string' AND p_skip IS DISTINCT FROM 'fb' THEN
      w := w || format(' AND ci.facet_b = %L', p_extra->>'fb');
    END IF;
  END IF;
  RETURN w;
END $$;

CREATE OR REPLACE FUNCTION dms_case_facet_counts(p_tenant uuid, p_actor uuid, p_office uuid, p_domain text, p_status text, p_q text, p_year integer,
                                      p_from timestamptz, p_to timestamptz, p_branch uuid, p_creator uuid, p_kind text, p_scan text,
                                      p_pending boolean, p_extra jsonb DEFAULT NULL)
RETURNS TABLE (group_key text, value text, label text, n bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE wc text; wb text; wk text; ws text; wy text; wt text; wo text; wr text; wfa text; wfb text;
BEGIN
  IF p_tenant IS NULL OR p_tenant::text IS DISTINCT FROM current_setting('app.tenant_id', true) THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM dms_index_ensure(p_tenant);
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.case.facets', true, 'ALLOWED', p_office, NULL, p_domain);
  wc := dms_ci_where(p_tenant, p_actor, p_office, p_domain, p_status, p_q, p_year, p_from, p_to, p_branch, p_creator, p_kind, p_scan, p_pending, 'creator', p_extra);
  wb := dms_ci_where(p_tenant, p_actor, p_office, p_domain, p_status, p_q, p_year, p_from, p_to, p_branch, p_creator, p_kind, p_scan, p_pending, 'branch', p_extra);
  wk := dms_ci_where(p_tenant, p_actor, p_office, p_domain, p_status, p_q, p_year, p_from, p_to, p_branch, p_creator, p_kind, p_scan, p_pending, 'kind', p_extra);
  ws := dms_ci_where(p_tenant, p_actor, p_office, p_domain, p_status, p_q, p_year, p_from, p_to, p_branch, p_creator, p_kind, p_scan, p_pending, 'scan', p_extra);
  wy := dms_ci_where(p_tenant, p_actor, p_office, p_domain, p_status, p_q, NULL, p_from, p_to, p_branch, p_creator, p_kind, p_scan, p_pending, NULL, p_extra);
  wt := dms_ci_where(p_tenant, p_actor, p_office, p_domain, p_status, p_q, p_year, p_from, p_to, p_branch, p_creator, p_kind, p_scan, p_pending, 'thv', p_extra);
  wo := dms_ci_where(p_tenant, p_actor, p_office, p_domain, p_status, p_q, p_year, p_from, p_to, p_branch, p_creator, p_kind, p_scan, p_pending, 'open', p_extra);
  wr := dms_ci_where(p_tenant, p_actor, p_office, p_domain, p_status, p_q, p_year, p_from, p_to, p_branch, p_creator, p_kind, p_scan, p_pending, 'returned', p_extra);
  wfa := dms_ci_where(p_tenant, p_actor, p_office, p_domain, p_status, p_q, p_year, p_from, p_to, p_branch, p_creator, p_kind, p_scan, p_pending, 'fa', p_extra);
  wfb := dms_ci_where(p_tenant, p_actor, p_office, p_domain, p_status, p_q, p_year, p_from, p_to, p_branch, p_creator, p_kind, p_scan, p_pending, 'fb', p_extra);
  RETURN QUERY EXECUTE format($q$
    SELECT 'creator', g.created_by::text, coalesce(u.full_name, nullif(split_part(u.external_ref, '@', 1), ''), '(không rõ)'), g.n
      FROM (SELECT ci.created_by, count(*) AS n FROM dms_case_index ci WHERE %1$s GROUP BY ci.created_by) g
      LEFT JOIN users u ON u.id = g.created_by AND u.tenant_id = %5$L
    UNION ALL
    SELECT 'branch', coalesce(g.branch_id::text, ''), coalesce(b.name, '(chưa gắn chi nhánh)'), g.n
      FROM (SELECT ci.branch_id, count(*) AS n FROM dms_case_index ci WHERE %2$s GROUP BY ci.branch_id) g
      LEFT JOIN branches b ON b.id = g.branch_id AND b.tenant_id = %5$L
    UNION ALL
    SELECT 'kind', k, k, count(*) FROM dms_case_index ci, unnest(ci.doc_kinds) k WHERE %3$s GROUP BY k
    UNION ALL
    SELECT 'scan', s, s, count(*) FROM (
      SELECT CASE WHEN ci.doc_count = 0 THEN 'empty' WHEN ci.scan_count = 0 THEN 'missing' ELSE 'complete' END AS s
        FROM dms_case_index ci WHERE %4$s) z GROUP BY s
    UNION ALL
    SELECT 'year', ci.rec_year::text, ci.rec_year::text, count(*) FROM dms_case_index ci WHERE %6$s AND ci.rec_year IS NOT NULL GROUP BY ci.rec_year
    UNION ALL
    SELECT 'thv', coalesce(g.thv_user_id::text, ''), coalesce(u.full_name, nullif(split_part(u.external_ref, '@', 1), ''), '(chưa chọn)'), g.n
      FROM (SELECT ci.thv_user_id, count(*) AS n FROM dms_case_index ci WHERE %7$s GROUP BY ci.thv_user_id) g
      LEFT JOIN users u ON u.id = g.thv_user_id AND u.tenant_id = %5$L
    UNION ALL
    SELECT 'open', ci.open_flag::text, ci.open_flag::text, count(*) FROM dms_case_index ci WHERE %8$s GROUP BY ci.open_flag
    UNION ALL
    SELECT 'returned', ci.returned::text, ci.returned::text, count(*) FROM dms_case_index ci WHERE %9$s GROUP BY ci.returned
    UNION ALL
    SELECT 'fa', ci.facet_a, ci.facet_a, count(*) FROM dms_case_index ci WHERE %10$s AND ci.facet_a IS NOT NULL GROUP BY ci.facet_a
    UNION ALL
    SELECT 'fb', ci.facet_b, ci.facet_b, count(*) FROM dms_case_index ci WHERE %11$s AND ci.facet_b IS NOT NULL GROUP BY ci.facet_b$q$,
    wc, wb, wk, ws, p_tenant, wy, wt, wo, wr, wfa, wfb);
END $$;

CREATE OR REPLACE FUNCTION dms_index_ensure(p_tenant uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v integer;
BEGIN
  IF EXISTS (SELECT 1 FROM dms_index_state WHERE tenant_id = p_tenant AND version >= 4) THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dms_index_ensure:' || p_tenant::text, 0));
  SELECT version INTO v FROM dms_index_state WHERE tenant_id = p_tenant;
  IF v >= 4 THEN RETURN; END IF;
  PERFORM dms_case_index_refresh(p_tenant, c.id) FROM dms_case_files c WHERE c.tenant_id = p_tenant;
  IF v IS NULL THEN
    PERFORM dms_osi_sync_row(r.tenant_id, r.version_id) FROM dms_ocr_results r WHERE r.tenant_id = p_tenant AND r.status = 'DONE';
    INSERT INTO dms_index_state (tenant_id, version) VALUES (p_tenant, 4) ON CONFLICT (tenant_id) DO UPDATE SET version = 4;
  ELSE
    UPDATE dms_index_state SET version = 4 WHERE tenant_id = p_tenant;
  END IF;
END $$;
