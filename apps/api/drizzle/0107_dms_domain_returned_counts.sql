-- Thẻ số "Đã trả kết quả" của danh sách bốn nghiệp vụ (Figma DMS v2, N2). Chỉ đếm hồ sơ ĐÃ ghi sổ có ô tích "đã trả" đang bật,
-- chỉ phần người xem được quyền đọc (cùng luật hiển thị như danh sách), năm theo ngày ghi sổ giờ Việt Nam.
-- Ô tích chỉ là dấu hiệu nhìn (N2): hàm này không đổi dữ liệu và không suy ra trạng thái nào.
CREATE FUNCTION dms_domain_returned_counts(p_tenant uuid, p_actor uuid, p_office uuid, p_year integer)
RETURNS TABLE (domain text, returned integer)
LANGUAGE plpgsql AS $$
BEGIN
  IF p_year IS NULL OR p_year NOT BETWEEN 2000 AND 2100 THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.report.returned', false, 'INVALID_INPUT', p_office, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.report.returned', true, 'ALLOWED', p_office, NULL, p_year::text);
  RETURN QUERY
    SELECT c.domain, count(*)::integer
      FROM dms_case_files c
      JOIN dms_case_returned r ON r.tenant_id = c.tenant_id AND r.case_id = c.id AND r.returned
     WHERE c.tenant_id = p_tenant AND c.office_id = p_office AND c.status = 'RECORDED'
       AND extract(year FROM c.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer = p_year
       AND dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by, c.branch_id)
     GROUP BY c.domain;
END $$;
