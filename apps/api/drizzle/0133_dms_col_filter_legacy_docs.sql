-- Lọc theo cột khớp với bảng hiển thị (sửa lỗi 16/11/2026): hồ sơ S-01 cũ nhiều dòng sổ có giá trị nằm ở giấy tờ, không ở hồ sơ, nên bộ lọc
-- "Tòa án: không có" hiện cả dòng có ✓ và "Ghi chú chứa ..." trả 0 dòng. Chỉ mục nay gộp thuộc tính hồ sơ (ưu tiên) với thuộc tính giấy tờ
-- của dòng sổ đầu, như bookCell. Dựng lại chỉ mục (phiên bản 8) ở lần tìm kiếm đầu của mỗi tenant. Tương thích ngược.

CREATE OR REPLACE FUNCTION dms_case_index_refresh(p_tenant uuid, p_case uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c dms_case_files; ce record; da jsonb; dk text; ma jsonb;
BEGIN
  SELECT * INTO c FROM dms_case_files WHERE id = p_case AND tenant_id = p_tenant;
  IF NOT FOUND THEN RETURN; END IF;
  -- Tìm theo giá trị HIỆN HÀNH (sau sửa đổi đã duyệt), đúng như danh sách và sổ hiển thị.
  SELECT * INTO ce FROM dms_case_effective(p_tenant, p_case);
  -- Dòng S-01 cũ (một dòng cho mỗi giấy tờ): ô thiếu ở hồ sơ thì lấy ở giấy tờ của dòng sổ đầu, đúng như danh sách hiển thị
  -- (bookCell). Nhờ đó lọc theo cột khớp với cái người dùng thấy trên bảng, kể cả hồ sơ cũ nhiều dòng sổ.
  SELECT dms_doc_effective_attrs(d.tenant_id, d.id), d.kind INTO da, dk
    FROM dms_book_entries e JOIN dms_documents d ON d.id = e.document_id AND d.tenant_id = e.tenant_id
   WHERE e.tenant_id = p_tenant AND e.case_id = p_case AND e.document_id IS NOT NULL
   ORDER BY e.stt LIMIT 1;
  ma := coalesce((SELECT jsonb_object_agg(x.key, x.value) FROM jsonb_each_text(coalesce(da, '{}'::jsonb)) x WHERE btrim(x.value) <> ''), '{}'::jsonb)
        || coalesce((SELECT jsonb_object_agg(x.key, x.value) FROM jsonb_each_text(ce.attributes) x WHERE btrim(x.value) <> ''), '{}'::jsonb);
  IF c.domain = 'tongdat' AND dk IS NOT NULL AND btrim(dk) <> '' AND NOT ma ? 'loai_van_ban' THEN ma := ma || jsonb_build_object('loai_van_ban', btrim(dk)); END IF;
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
           WHEN 'tochuc' THEN NOT coalesce((SELECT r.returned FROM dms_case_returned r WHERE r.tenant_id = c.tenant_id AND r.case_id = c.id), false)
                              AND NOT EXISTS (SELECT 1 FROM dms_documents x WHERE x.tenant_id = c.tenant_id AND x.case_id = c.id
                                                AND x.status <> 'CANCELLED' AND x.kind ILIKE '%N-08%')
           ELSE false
         END,
         -- Bộ lọc nghiệp vụ (0126): giá trị thô của hồ sơ, dùng cho ô chọn có đếm. Rỗng = NULL.
         nullif(btrim(CASE c.domain
           WHEN 'tongdat' THEN ma->>'hinh_thuc_tong_dat'
           WHEN 'vibang' THEN (regexp_split_to_array(coalesce(ce.attributes->>'dia_chi_noi_lap', ''), '\s*,\s*'))[
                                greatest(1, array_length(regexp_split_to_array(coalesce(ce.attributes->>'dia_chi_noi_lap', ''), '\s*,\s*'), 1))]
           WHEN 'xacminh' THEN ma->>'ket_qua_xac_minh'
           WHEN 'tochuc' THEN ma->>'ket_qua_thi_hanh_an'
         END), ''),
         nullif(btrim(CASE c.domain
           WHEN 'tongdat' THEN CASE WHEN btrim(coalesce(ma->>'co_quan_toa_an', '')) <> '' THEN 'Tòa án'
                                    WHEN btrim(coalesce(ma->>'co_quan_thads', '')) <> '' THEN 'Cơ quan THADS'
                                    WHEN btrim(coalesce(ma->>'co_quan_kiem_sat', '')) <> '' THEN 'Cơ quan kiểm sát' END
         END), ''),
         -- Hạn báo kết quả tống đạt (0128): chỉ hồ sơ Tống đạt đã ghi sổ có Ngày tống đạt đọc được.
         CASE WHEN c.domain = 'tongdat' AND c.status = 'RECORDED' AND dms_parse_vn_date(ce.attributes->>'ngay_tong_dat') IS NOT NULL
              THEN of_working_due(c.tenant_id, c.office_id,
                     dms_parse_vn_date(ce.attributes->>'ngay_tong_dat')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh', 2) END,
         -- Lọc theo cột (0131): giá trị gốc từng thuộc tính sổ (tối đa 300 ký tự) + `stt` = số hồ sơ.
         coalesce((SELECT jsonb_object_agg(e.key, left(btrim(e.value), 300)) FROM jsonb_each_text(ma) e), '{}'::jsonb)
           || CASE WHEN c.case_number IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('stt', c.case_number) END
  ON CONFLICT (case_id) DO UPDATE SET
    office_id = EXCLUDED.office_id, domain = EXCLUDED.domain, status = EXCLUDED.status, branch_id = EXCLUDED.branch_id,
    created_by = EXCLUDED.created_by, created_at = EXCLUDED.created_at, recorded_at = EXCLUDED.recorded_at, sort_at = EXCLUDED.sort_at,
    rec_year = EXCLUDED.rec_year, doc_count = EXCLUDED.doc_count, scan_count = EXCLUDED.scan_count, doc_kinds = EXCLUDED.doc_kinds,
    pending_count = EXCLUDED.pending_count, search_text = EXCLUDED.search_text,
    thv_user_id = EXCLUDED.thv_user_id, returned = EXCLUDED.returned, open_flag = EXCLUDED.open_flag,
    facet_a = EXCLUDED.facet_a, facet_b = EXCLUDED.facet_b, due_at = EXCLUDED.due_at, cols = EXCLUDED.cols;
END $$;

CREATE OR REPLACE FUNCTION dms_index_ensure(p_tenant uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v integer;
BEGIN
  IF EXISTS (SELECT 1 FROM dms_index_state WHERE tenant_id = p_tenant AND version >= 8) THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dms_index_ensure:' || p_tenant::text, 0));
  SELECT version INTO v FROM dms_index_state WHERE tenant_id = p_tenant;
  IF v >= 8 THEN RETURN; END IF;
  PERFORM dms_case_index_refresh(p_tenant, c.id) FROM dms_case_files c WHERE c.tenant_id = p_tenant;
  IF v IS NULL THEN
    PERFORM dms_osi_sync_row(r.tenant_id, r.version_id) FROM dms_ocr_results r WHERE r.tenant_id = p_tenant AND r.status = 'DONE';
    INSERT INTO dms_index_state (tenant_id, version) VALUES (p_tenant, 8) ON CONFLICT (tenant_id) DO UPDATE SET version = 8;
  ELSE
    UPDATE dms_index_state SET version = 8 WHERE tenant_id = p_tenant;
  END IF;
END $$;

