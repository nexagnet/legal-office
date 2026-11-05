-- Bộ lọc mới cho danh sách 4 nghiệp vụ (chủ dự án chốt 05/11/2026): lọc theo Thừa hành viên, Việc còn dở, Đã trả kết quả.
-- Căn cứ: tài liệu "Phương án bộ lọc hồ sơ cho 4 nghiệp vụ" (Phương án B) và Figma DMS v2, trang 01 · Vi bằng (511:450, 512:469, 512:759).
--
-- Nguyên tắc giữ nguyên như 0098: mọi tiêu chí là CỘT của dms_case_index, lọc bằng điều kiện cột thuần trong dms_ci_where;
-- quyền xem và phạm vi chi nhánh vẫn do dms_ci_vis_sql quyết định, bộ lọc chỉ thu hẹp thêm.
--  * thv_user_id: Thừa hành viên của hồ sơ (dms_case_files.thv_user_id).
--  * returned:    ô "Đã trả kết quả" (dms_case_returned), chưa đánh dấu = false.
--  * open_flag:   "Việc còn dở", CÙNG LUẬT với thẻ số dms_domain_pending_counts (0102) để thẻ số và bộ lọc luôn khớp:
--      tongdat: còn giấy tờ (tài liệu chưa hủy) chưa có "ngay_tong_dat";
--      xacminh: hồ sơ chưa có "ket_qua_xac_minh";
--      tochuc:  hồ sơ chưa có tài liệu loại N-08 (kind chứa "N-08", không phân biệt hoa thường);
--      nghiệp vụ khác: luôn false.
-- Tham số lọc mới đi trong MỘT tham số jsonb cuối `p_extra` (mặc định NULL) để không đổi thứ tự tham số cũ:
--   {"thv": ["uuid", ...], "open": true|false, "returned": true|false}

-- ===== Cột và chỉ mục =====
ALTER TABLE dms_case_index
  ADD COLUMN thv_user_id uuid,
  ADD COLUMN returned boolean NOT NULL DEFAULT false,
  ADD COLUMN open_flag boolean NOT NULL DEFAULT false;
CREATE INDEX dms_ci_thv_idx ON dms_case_index (tenant_id, office_id, domain, status, thv_user_id, sort_at DESC, case_id DESC);
CREATE INDEX dms_ci_open_idx ON dms_case_index (tenant_id, office_id, domain, status, sort_at DESC, case_id DESC) WHERE open_flag;

-- ===== Dựng dòng chỉ mục: thêm ba cột mới (phần còn lại giữ đúng định nghĩa hiện hành sau 0105) =====
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
           WHEN 'tongdat' THEN EXISTS (SELECT 1 FROM dms_documents x WHERE x.tenant_id = c.tenant_id AND x.case_id = c.id
                                         AND x.status <> 'CANCELLED' AND btrim(coalesce(x.attributes->>'ngay_tong_dat', '')) = '')
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

-- Ô "Đã trả kết quả" nằm ở bảng riêng: đổi thì dựng lại dòng chỉ mục của hồ sơ.
CREATE FUNCTION dms_ci_trg_returned() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM dms_case_index_refresh(NEW.tenant_id, NEW.case_id); RETURN NULL; END $$;
CREATE TRIGGER dms_ci_returned_trg AFTER INSERT OR UPDATE ON dms_case_returned FOR EACH ROW EXECUTE FUNCTION dms_ci_trg_returned();

-- ===== Nạp lại chỉ mục cho tenant đã lập chỉ mục trước migration này =====
-- Migration không đọc được dữ liệu các tenant (RLS), nên đánh phiên bản chỉ mục: tenant có phiên bản cũ sẽ được dựng lại các dòng
-- hồ sơ ở lần tìm kiếm đầu tiên sau khi triển khai (dữ liệu hiện nhỏ nên tức thì). Bảng OCR không đổi nên không nạp lại.
ALTER TABLE dms_index_state ADD COLUMN version integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION dms_index_ensure(p_tenant uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v integer;
BEGIN
  IF EXISTS (SELECT 1 FROM dms_index_state WHERE tenant_id = p_tenant AND version >= 2) THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dms_index_ensure:' || p_tenant::text, 0));
  SELECT version INTO v FROM dms_index_state WHERE tenant_id = p_tenant;
  IF v >= 2 THEN RETURN; END IF;
  PERFORM dms_case_index_refresh(p_tenant, c.id) FROM dms_case_files c WHERE c.tenant_id = p_tenant;
  IF v IS NULL THEN
    PERFORM dms_osi_sync_row(r.tenant_id, r.version_id) FROM dms_ocr_results r WHERE r.tenant_id = p_tenant AND r.status = 'DONE';
    INSERT INTO dms_index_state (tenant_id, version) VALUES (p_tenant, 2) ON CONFLICT (tenant_id) DO UPDATE SET version = 2;
  ELSE
    UPDATE dms_index_state SET version = 2 WHERE tenant_id = p_tenant;
  END IF;
END $$;

-- ===== Điều kiện lọc: thêm p_extra =====
DROP FUNCTION dms_case_facet_counts(uuid, uuid, uuid, text, text, text, integer, timestamptz, timestamptz, uuid, uuid, text, text, boolean);
DROP FUNCTION dms_search_cases(uuid, uuid, uuid, text, text, text, integer, timestamptz, timestamptz, uuid, uuid, text, text, boolean, text, text, integer, integer, boolean);
DROP FUNCTION dms_ci_where(uuid, uuid, uuid, text, text, text, integer, timestamptz, timestamptz, uuid, uuid, text, text, boolean, text);

-- p_skip bỏ MỘT nhóm lọc phụ (creator|branch|kind|scan|thv|open|returned) để đếm facet kiểu "chọn giá trị khác trong cùng nhóm".
CREATE FUNCTION dms_ci_where(p_tenant uuid, p_actor uuid, p_office uuid, p_domain text, p_status text, p_q text, p_year integer,
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
  END IF;
  RETURN w;
END $$;

-- ===== Danh sách + tìm hồ sơ (như 0098, thêm p_extra; trả thêm thv_user_id) =====
CREATE FUNCTION dms_search_cases(p_tenant uuid, p_actor uuid, p_office uuid, p_domain text, p_status text, p_q text, p_year integer,
                                 p_from timestamptz, p_to timestamptz, p_branch uuid, p_creator uuid, p_kind text, p_scan text,
                                 p_pending boolean, p_sort text, p_cursor text, p_limit integer, p_offset integer, p_with_total boolean,
                                 p_extra jsonb DEFAULT NULL)
RETURNS TABLE (id uuid, domain text, title text, status text, created_by uuid, creator_name text, created_at timestamptz,
               recorded_at timestamptz, branch_id uuid, branch_name text, document_count integer, scan_count integer,
               doc_kinds text[], pending_count integer, attributes jsonb, cursor text, total_capped bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE w text; asc_ boolean := (p_sort = 'oldest'); lim integer := greatest(1, least(coalesce(p_limit, 50), 200));
        cur_ts timestamptz; cur_id uuid; cw text := ''; total bigint := NULL; dir text;
BEGIN
  IF p_tenant IS NULL OR p_tenant::text IS DISTINCT FROM current_setting('app.tenant_id', true) THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM dms_index_ensure(p_tenant);
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.case.search', true, 'ALLOWED', p_office, NULL, p_domain);
  w := dms_ci_where(p_tenant, p_actor, p_office, p_domain, p_status, p_q, p_year, p_from, p_to, p_branch, p_creator, p_kind, p_scan,
                    p_pending, NULL, p_extra);
  dir := CASE WHEN asc_ THEN 'ASC' ELSE 'DESC' END;
  IF p_cursor IS NOT NULL AND p_cursor <> '' THEN
    cur_ts := split_part(p_cursor, '|', 1)::timestamptz;
    cur_id := split_part(p_cursor, '|', 2)::uuid;
    cw := format(' AND (ci.sort_at, ci.case_id) %s (%L, %L)', CASE WHEN asc_ THEN '>' ELSE '<' END, cur_ts, cur_id);
  END IF;
  IF coalesce(p_with_total, false) THEN
    EXECUTE format('SELECT count(*) FROM (SELECT 1 FROM dms_case_index ci WHERE %s LIMIT 10001) x', w) INTO total;
  END IF;
  RETURN QUERY EXECUTE format($q$
    SELECT p.case_id, p.domain, ce.title, p.status, p.created_by,
           coalesce(u.full_name, nullif(split_part(u.external_ref, '@', 1), '')), p.created_at, p.recorded_at, p.branch_id, b.name,
           p.doc_count, p.scan_count, p.doc_kinds, p.pending_count, ce.attributes, dms_ci_cursor(p.sort_at, p.case_id), %L::bigint
      FROM (SELECT ci.* FROM dms_case_index ci WHERE %s%s ORDER BY ci.sort_at %s, ci.case_id %s LIMIT %s OFFSET %s) p
      CROSS JOIN LATERAL dms_case_effective(p.tenant_id, p.case_id) ce
      LEFT JOIN users u ON u.id = p.created_by AND u.tenant_id = p.tenant_id
      LEFT JOIN branches b ON b.id = p.branch_id AND b.tenant_id = p.tenant_id
     ORDER BY p.sort_at %s, p.case_id %s$q$,
    total, w, cw, dir, dir, lim, greatest(0, coalesce(p_offset, 0)), dir, dir);
END $$;

-- ===== Facet có đếm: thêm nhóm thv, open, returned =====
CREATE FUNCTION dms_case_facet_counts(p_tenant uuid, p_actor uuid, p_office uuid, p_domain text, p_status text, p_q text, p_year integer,
                                      p_from timestamptz, p_to timestamptz, p_branch uuid, p_creator uuid, p_kind text, p_scan text,
                                      p_pending boolean, p_extra jsonb DEFAULT NULL)
RETURNS TABLE (group_key text, value text, label text, n bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE wc text; wb text; wk text; ws text; wy text; wt text; wo text; wr text;
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
    SELECT 'returned', ci.returned::text, ci.returned::text, count(*) FROM dms_case_index ci WHERE %9$s GROUP BY ci.returned$q$,
    wc, wb, wk, ws, p_tenant, wy, wt, wo, wr);
END $$;
