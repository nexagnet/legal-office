-- Tìm hồ sơ theo SỐ HỒ SƠ (vd "038/2026/VB-TPL", "038/2026", "038", "38", "vb-thv"): trước đây search_text của dms_case_index chỉ gồm
-- tiêu đề, thuộc tính và tài liệu, KHÔNG gồm cột dms_case_files.case_number, nên gõ số hồ sơ không ra kết quả.
-- Sửa: đưa case_number vào đầu search_text (dms_fold bỏ dấu, hạ chữ thường nên không phân biệt hoa thường; khớp chuỗi con nên số rút gọn
-- và số 0 đầu đều tìm được). Dùng chung cho cả 4 nghiệp vụ (Vi bằng, Tống đạt, Xác minh THA, Tổ chức THA).
-- Phiên bản chỉ mục tăng lên 3 để mọi tenant tự dựng lại chỉ mục ở lần tìm kiếm đầu tiên sau khi triển khai.

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
         dms_fold(left(concat_ws(' ', c.case_number, ce.title,
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
