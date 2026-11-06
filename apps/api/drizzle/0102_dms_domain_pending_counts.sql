-- Thẻ số "việc còn dở" của danh sách bốn nghiệp vụ (Figma DMS v2: Tống đạt "Chưa tống đạt", Xác minh "Chưa có kết quả",
-- Tổ chức "Chưa có biên bản N-08"). Chỉ đếm, chỉ phần người xem được quyền đọc (cùng luật hiển thị như danh sách),
-- năm theo ngày ghi sổ giờ Việt Nam. Không đổi dữ liệu, không tự suy trạng thái.
--  - tongdat: giấy tờ (tài liệu chưa hủy) chưa có "ngay_tong_dat";
--  - xacminh: hồ sơ chưa có "ket_qua_xac_minh";
--  - tochuc: hồ sơ chưa có tài liệu loại N-08 (kind chứa "N-08", không phân biệt hoa thường).
CREATE FUNCTION dms_domain_pending_counts(p_tenant uuid, p_actor uuid, p_office uuid, p_year integer)
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
           (SELECT count(*)::integer FROM dms_documents x JOIN dms_case_files c ON c.id = x.case_id AND c.tenant_id = x.tenant_id
             WHERE c.tenant_id = p_tenant AND c.office_id = p_office AND c.domain = 'tongdat' AND c.status = 'RECORDED' AND x.status <> 'CANCELLED'
               AND btrim(coalesce(x.attributes->>'ngay_tong_dat', '')) = ''
               AND extract(year FROM c.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer = p_year
               AND dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by))
    UNION ALL
    SELECT 'xacminh'::text,
           (SELECT count(*)::integer FROM dms_case_files c
             WHERE c.tenant_id = p_tenant AND c.office_id = p_office AND c.domain = 'xacminh' AND c.status = 'RECORDED'
               AND btrim(coalesce(c.attributes->>'ket_qua_xac_minh', '')) = ''
               AND extract(year FROM c.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer = p_year
               AND dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by))
    UNION ALL
    SELECT 'tochuc'::text,
           (SELECT count(*)::integer FROM dms_case_files c
             WHERE c.tenant_id = p_tenant AND c.office_id = p_office AND c.domain = 'tochuc' AND c.status = 'RECORDED'
               AND NOT EXISTS (SELECT 1 FROM dms_documents x WHERE x.case_id = c.id AND x.tenant_id = c.tenant_id
                                 AND x.status <> 'CANCELLED' AND x.kind ILIKE '%N-08%')
               AND extract(year FROM c.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer = p_year
               AND dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by));
END $$;
