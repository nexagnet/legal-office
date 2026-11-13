-- Lọc theo cột cho 4 nghiệp vụ (chủ dự án duyệt thiết kế 13/11/2026).
--   dms_case_index.cols: giá trị gốc từng thuộc tính sổ của hồ sơ (hiệu lực, sau sửa đổi đã duyệt) + `stt` = số hồ sơ.
--   p_extra.cols (dms_ci_where): lọc từng cột theo chữ chứa / chọn nhiều / khoảng ngày / có-không. Chạy sau các điều kiện chỉ mục
--   sẵn có (tenant, văn phòng, nghiệp vụ, trạng thái, năm) nên chỉ quét tập đã thu hẹp; chưa tạo chỉ mục riêng cho cột (đo trước, xem docs).
--   dms_col_values: giá trị có đếm của một cột (tối đa 50) cho ô "chọn nhiều", tính trên bộ lọc hiện hành trừ chính cột đó.
-- Dựng lại chỉ mục (phiên bản 7) ở lần tìm kiếm đầu của mỗi tenant. Tương thích ngược: không có p_extra.cols thì như cũ.

ALTER TABLE dms_case_index ADD COLUMN cols jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Ngày đầu tiên dạng d/m/yyyy trong chuỗi (chịu được tiền tố "ngày", "012/2026 ngày 03/10/2026"); sai thì NULL, không báo lỗi.
CREATE FUNCTION dms_first_vn_date(p_text text) RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE m text[];
BEGIN
  m := regexp_match(coalesce(p_text, ''), '(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})');
  IF m IS NULL THEN RETURN NULL; END IF;
  RETURN make_date(m[3]::integer, m[2]::integer, m[1]::integer);
EXCEPTION WHEN OTHERS THEN RETURN NULL;
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
                                   thv_user_id, returned, open_flag, facet_a, facet_b, due_at, cols)
  SELECT c.id, c.tenant_id, c.office_id, c.domain, c.status, c.branch_id, c.created_by, c.created_at, c.recorded_at,
         coalesce(c.recorded_at, c.created_at),
         CASE WHEN c.recorded_at IS NULL THEN NULL ELSE extract(year FROM c.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer END,
         (SELECT count(*)::integer FROM dms_documents d WHERE d.tenant_id = c.tenant_id AND d.case_id = c.id AND d.status <> 'CANCELLED'),
         (SELECT count(*)::integer FROM dms_document_files f JOIN dms_documents d ON d.id = f.document_id AND d.tenant_id = f.tenant_id
           WHERE f.tenant_id = c.tenant_id AND d.case_id = c.id AND d.status <> 'CANCELLED' AND f.is_scan AND f.deleted_at IS NULL),
         coalesce((SELECT array_agg(DISTINCT d.kind ORDER BY d.kind) FROM dms_documents d
                    WHERE d.tenant_id = c.tenant_id AND d.case_id = c.id AND d.status <> 'CANCELLED'), '{}'::text[]),
         (SELECT count(*)::integer FROM dms_amendment_requests a WHERE a.tenant_id = c.tenant_id AND a.case_id = c.id AND a.status = 'PENDING'),
         dms_fold(left(concat_ws(' ', c.case_number, ce.title,
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
         -- Bộ lọc nghiệp vụ (0126): giá trị thô của hồ sơ, dùng cho ô chọn có đếm. Rỗng = NULL.
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
         END), ''),
         -- Hạn báo kết quả tống đạt (0128): chỉ hồ sơ Tống đạt đã ghi sổ có Ngày tống đạt đọc được.
         CASE WHEN c.domain = 'tongdat' AND c.status = 'RECORDED' AND dms_parse_vn_date(ce.attributes->>'ngay_tong_dat') IS NOT NULL
              THEN of_working_due(c.tenant_id, c.office_id,
                     dms_parse_vn_date(ce.attributes->>'ngay_tong_dat')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh', 2) END,
         -- Lọc theo cột (0130): giá trị gốc từng thuộc tính sổ (tối đa 300 ký tự) + `stt` = số hồ sơ.
         coalesce((SELECT jsonb_object_agg(e.key, left(btrim(e.value), 300)) FROM jsonb_each_text(ce.attributes) e WHERE btrim(e.value) <> ''), '{}'::jsonb)
           || CASE WHEN c.case_number IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('stt', c.case_number) END
  ON CONFLICT (case_id) DO UPDATE SET
    office_id = EXCLUDED.office_id, domain = EXCLUDED.domain, status = EXCLUDED.status, branch_id = EXCLUDED.branch_id,
    created_by = EXCLUDED.created_by, created_at = EXCLUDED.created_at, recorded_at = EXCLUDED.recorded_at, sort_at = EXCLUDED.sort_at,
    rec_year = EXCLUDED.rec_year, doc_count = EXCLUDED.doc_count, scan_count = EXCLUDED.scan_count, doc_kinds = EXCLUDED.doc_kinds,
    pending_count = EXCLUDED.pending_count, search_text = EXCLUDED.search_text,
    thv_user_id = EXCLUDED.thv_user_id, returned = EXCLUDED.returned, open_flag = EXCLUDED.open_flag,
    facet_a = EXCLUDED.facet_a, facet_b = EXCLUDED.facet_b, due_at = EXCLUDED.due_at, cols = EXCLUDED.cols;
END $$;

CREATE OR REPLACE FUNCTION dms_ci_where(p_tenant uuid, p_actor uuid, p_office uuid, p_domain text, p_status text, p_q text, p_year integer,
                             p_from timestamptz, p_to timestamptz, p_branch uuid, p_creator uuid, p_kind text, p_scan text,
                             p_pending boolean, p_skip text DEFAULT NULL, p_extra jsonb DEFAULT NULL)
RETURNS text LANGUAGE plpgsql STABLE AS $$
DECLARE w text; term text; n integer := 0; thv uuid[]; ck text; cv jsonb; cn integer := 0; ct integer; ds text;
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
    IF jsonb_typeof(p_extra->'overdue') = 'boolean' AND p_skip IS DISTINCT FROM 'overdue' THEN
      w := w || format(' AND %s (ci.due_at IS NOT NULL AND ci.due_at < now() AND NOT ci.returned)',
                       CASE WHEN (p_extra->>'overdue')::boolean THEN '' ELSE 'NOT' END);
    END IF;
    IF jsonb_typeof(p_extra->'fa') = 'string' AND p_skip IS DISTINCT FROM 'fa' THEN
      w := w || format(' AND ci.facet_a = %L', p_extra->>'fa');
    END IF;
    IF jsonb_typeof(p_extra->'fb') = 'string' AND p_skip IS DISTINCT FROM 'fb' THEN
      w := w || format(' AND ci.facet_b = %L', p_extra->>'fb');
    END IF;
    -- Lọc theo cột (0130): {"<khoá cột>": {"c": "chữ chứa"} | {"in": [giá trị gốc]} | {"d": {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD"}} | {"b": true|false}}.
    -- Khoá chỉ [a-z0-9_] (API còn đối chiếu danh sách cột của sổ); chữ chứa đã bỏ dấu, chỉ [a-z0-9/.-] nên không chèn được ký tự đại diện LIKE.
    IF jsonb_typeof(p_extra->'cols') = 'object' THEN
      FOR ck, cv IN SELECT * FROM jsonb_each(p_extra->'cols') LOOP
        cn := cn + 1;
        EXIT WHEN cn > 12;
        CONTINUE WHEN ck !~ '^[a-z0-9_]{1,40}$' OR p_skip = 'col:' || ck;
        IF jsonb_typeof(cv->'c') = 'string' THEN
          ct := 0;
          FOR term IN SELECT DISTINCT t FROM unnest(regexp_split_to_array(dms_fold(cv->>'c'), '[^a-z0-9/.-]+')) t WHERE t <> '' LOOP
            ct := ct + 1;
            EXIT WHEN ct > 6;
            w := w || format(' AND dms_fold(coalesce(ci.cols->>%L, '''')) LIKE %L', ck, '%' || term || '%');
          END LOOP;
        END IF;
        IF jsonb_typeof(cv->'in') = 'array' AND jsonb_array_length(cv->'in') > 0 THEN
          w := w || format(' AND ci.cols->>%L = ANY(%L::text[])', ck, ARRAY(SELECT jsonb_array_elements_text(cv->'in')));
        END IF;
        IF jsonb_typeof(cv->'d') = 'object' THEN
          ds := cv->'d'->>'from';
          IF ds IS NOT NULL THEN w := w || format(' AND dms_first_vn_date(ci.cols->>%L) >= %L::date', ck, ds); END IF;
          ds := cv->'d'->>'to';
          IF ds IS NOT NULL THEN w := w || format(' AND dms_first_vn_date(ci.cols->>%L) <= %L::date', ck, ds); END IF;
        END IF;
        IF jsonb_typeof(cv->'b') = 'boolean' THEN
          w := w || format(' AND (btrim(coalesce(ci.cols->>%L, '''')) <> '''') = %L::boolean', ck, (cv->>'b')::boolean);
        END IF;
      END LOOP;
    END IF;
  END IF;
  RETURN w;
END $$;

CREATE OR REPLACE FUNCTION dms_index_ensure(p_tenant uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v integer;
BEGIN
  IF EXISTS (SELECT 1 FROM dms_index_state WHERE tenant_id = p_tenant AND version >= 7) THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dms_index_ensure:' || p_tenant::text, 0));
  SELECT version INTO v FROM dms_index_state WHERE tenant_id = p_tenant;
  IF v >= 7 THEN RETURN; END IF;
  PERFORM dms_case_index_refresh(p_tenant, c.id) FROM dms_case_files c WHERE c.tenant_id = p_tenant;
  IF v IS NULL THEN
    PERFORM dms_osi_sync_row(r.tenant_id, r.version_id) FROM dms_ocr_results r WHERE r.tenant_id = p_tenant AND r.status = 'DONE';
    INSERT INTO dms_index_state (tenant_id, version) VALUES (p_tenant, 7) ON CONFLICT (tenant_id) DO UPDATE SET version = 7;
  ELSE
    UPDATE dms_index_state SET version = 7 WHERE tenant_id = p_tenant;
  END IF;
END $$;

CREATE FUNCTION dms_col_values(p_tenant uuid, p_actor uuid, p_office uuid, p_domain text, p_status text, p_q text, p_year integer,
                               p_from timestamptz, p_to timestamptz, p_branch uuid, p_creator uuid, p_kind text, p_scan text,
                               p_pending boolean, p_extra jsonb, p_key text, p_term text)
RETURNS TABLE (value text, n bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE w text; tw text := '';
BEGIN
  IF p_tenant IS NULL OR p_tenant::text IS DISTINCT FROM current_setting('app.tenant_id', true) THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_key IS NULL OR p_key !~ '^[a-z0-9_]{1,40}$' THEN RAISE EXCEPTION 'invalid column key'; END IF;
  PERFORM dms_index_ensure(p_tenant);
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.case.col_values', true, 'ALLOWED', p_office, NULL, p_domain);
  w := dms_ci_where(p_tenant, p_actor, p_office, p_domain, p_status, p_q, p_year, p_from, p_to, p_branch, p_creator, p_kind, p_scan, p_pending, 'col:' || p_key, p_extra);
  IF coalesce(p_term, '') <> '' AND dms_fold(p_term) ~ '^[a-z0-9/. -]+$' THEN
    tw := format(' AND dms_fold(ci.cols->>%L) LIKE %L', p_key, '%' || dms_fold(btrim(p_term)) || '%');
  END IF;
  RETURN QUERY EXECUTE format('SELECT ci.cols->>%L, count(*) AS n FROM dms_case_index ci WHERE %s AND ci.cols->>%L IS NOT NULL%s GROUP BY 1 ORDER BY n DESC, 1 LIMIT 50',
                              p_key, w, p_key, tw);
END $$;
