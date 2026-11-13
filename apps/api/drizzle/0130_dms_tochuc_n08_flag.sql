-- Tổ chức THA: "Việc còn dở" (Chưa có biên bản N-08) dựa vào ô tích, không còn dựa vào loại tài liệu (chủ dự án chốt 13/11/2026,
-- sau khi bỏ "Loại tài liệu" khỏi giao diện và luồng tải lên; tệp tải lên mới đều thuộc "Tài liệu khác").
--   * Ô tích dùng lại cờ "Đã trả KQ" (dms_case_returned) vì N-08 là bước SAU ghi sổ nên phải sửa được trên hồ sơ đã ghi sổ (dữ liệu sổ bất biến),
--     đã có quyền (thêm tài liệu), nhật ký và cột trong danh sách. Riêng Tổ chức THA, giao diện gọi ô này là "Đã có N-08".
--   * Còn dở = hồ sơ đã ghi sổ, chưa tích ô và chưa có tài liệu loại N-08 (suy ra từ dữ liệu cũ đã gắn loại N-08).
--   * Hàm đếm thẻ số (dms_domain_pending_counts) đổi cùng luật để luôn khớp bộ lọc "Việc còn dở".
-- Không đổi cột/bảng; chỉ thay hai hàm. Chỉ mục KHÔNG cần dựng lại: hồ sơ chưa tích ô cho kết quả y như cũ.

CREATE OR REPLACE FUNCTION dms_case_index_refresh(p_tenant uuid, p_case uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c dms_case_files; ce record;
BEGIN
  SELECT * INTO c FROM dms_case_files WHERE id = p_case AND tenant_id = p_tenant;
  IF NOT FOUND THEN RETURN; END IF;
  -- Tìm theo giá trị HIỆN HÀNH (sau sửa đổi đã duyệt), đúng như danh sách và sổ hiển thị.
  SELECT * INTO ce FROM dms_case_effective(p_tenant, p_case);
  INSERT INTO dms_case_index AS i (case_id, tenant_id, office_id, domain, status, branch_id, created_by, created_at, recorded_at, sort_at,
                                   rec_year, doc_count, scan_count, doc_kinds, pending_count, search_text,
                                   thv_user_id, returned, open_flag, facet_a, facet_b, due_at)
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
                     dms_parse_vn_date(ce.attributes->>'ngay_tong_dat')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh', 2) END
  ON CONFLICT (case_id) DO UPDATE SET
    office_id = EXCLUDED.office_id, domain = EXCLUDED.domain, status = EXCLUDED.status, branch_id = EXCLUDED.branch_id,
    created_by = EXCLUDED.created_by, created_at = EXCLUDED.created_at, recorded_at = EXCLUDED.recorded_at, sort_at = EXCLUDED.sort_at,
    rec_year = EXCLUDED.rec_year, doc_count = EXCLUDED.doc_count, scan_count = EXCLUDED.scan_count, doc_kinds = EXCLUDED.doc_kinds,
    pending_count = EXCLUDED.pending_count, search_text = EXCLUDED.search_text,
    thv_user_id = EXCLUDED.thv_user_id, returned = EXCLUDED.returned, open_flag = EXCLUDED.open_flag,
    facet_a = EXCLUDED.facet_a, facet_b = EXCLUDED.facet_b, due_at = EXCLUDED.due_at;
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
               AND NOT coalesce((SELECT r.returned FROM dms_case_returned r WHERE r.tenant_id = c.tenant_id AND r.case_id = c.id), false)
               AND NOT EXISTS (SELECT 1 FROM dms_documents x WHERE x.case_id = c.id AND x.tenant_id = c.tenant_id
                                 AND x.status <> 'CANCELLED' AND x.kind ILIKE '%N-08%')
               AND extract(year FROM c.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer = p_year
               AND dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by, c.branch_id));
END $$;
