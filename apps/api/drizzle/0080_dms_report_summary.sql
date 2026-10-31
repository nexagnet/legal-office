-- DMS Phase 5: báo cáo tổng hợp CHỈ SỐ LIỆU (owner 2026-10-30: N-09/N-10 là số tổng hợp, không tự lập báo cáo).
-- Không phải mẫu N-09/N-10 chính thức: bố cục mẫu chờ file Excel gốc của khách (không tự suy). Chỉ đọc.
-- Chỉ đếm hồ sơ mà người xem được quyền đọc (cùng luật hiển thị như danh sách). Năm theo ngày ghi sổ, giờ Việt Nam.
-- Số hồ sơ/tài liệu/bản scan là giá trị hiện hành; số yêu cầu sửa đổi đếm theo ngày gửi trong năm.
CREATE FUNCTION dms_report_summary(p_tenant uuid, p_actor uuid, p_office uuid, p_year integer)
RETURNS TABLE (domain text, recorded_cases integer, documents integer, scans integer, amendments integer, last_stt integer)
LANGUAGE plpgsql AS $$
BEGIN
  IF p_year IS NULL OR p_year NOT BETWEEN 2000 AND 2100 THEN
    PERFORM vibang_audit(p_tenant, p_actor, 'dms.report.summary', false, 'INVALID_INPUT', p_office, NULL, NULL);
    RETURN;
  END IF;
  PERFORM vibang_audit(p_tenant, p_actor, 'dms.report.summary', true, 'ALLOWED', p_office, NULL, p_year::text);
  RETURN QUERY
    SELECT d.domain,
           (SELECT count(*)::integer FROM dms_case_files c
             WHERE c.tenant_id = p_tenant AND c.office_id = p_office AND c.domain = d.domain AND c.status = 'RECORDED'
               AND extract(year FROM c.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer = p_year
               AND dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by)),
           (SELECT count(*)::integer FROM dms_documents x JOIN dms_case_files c ON c.id = x.case_id AND c.tenant_id = x.tenant_id
             WHERE c.tenant_id = p_tenant AND c.office_id = p_office AND c.domain = d.domain AND c.status = 'RECORDED' AND x.status <> 'CANCELLED'
               AND extract(year FROM c.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer = p_year
               AND dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by)),
           (SELECT count(*)::integer FROM dms_document_files f
             JOIN dms_documents x ON x.id = f.document_id AND x.tenant_id = f.tenant_id
             JOIN dms_case_files c ON c.id = x.case_id AND c.tenant_id = x.tenant_id
             WHERE c.tenant_id = p_tenant AND c.office_id = p_office AND c.domain = d.domain AND c.status = 'RECORDED' AND x.status <> 'CANCELLED' AND f.is_scan
               AND extract(year FROM c.recorded_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer = p_year
               AND dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by)),
           (SELECT count(*)::integer FROM dms_amendment_requests a JOIN dms_case_files c ON c.id = a.case_id AND c.tenant_id = a.tenant_id
             WHERE a.tenant_id = p_tenant AND a.office_id = p_office AND c.domain = d.domain
               AND extract(year FROM a.requested_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::integer = p_year
               AND dms_case_visible(p_tenant, p_actor, c.office_id, c.domain, c.status, c.created_by)),
           (SELECT k.last_value FROM dms_book_counters k
             WHERE k.tenant_id = p_tenant AND k.office_id = p_office AND k.year = p_year AND k.book = dms_book_of(d.domain))
    FROM unnest(ARRAY['vibang', 'tongdat', 'xacminh', 'tochuc', 'vtden', 'vtdi', 'vtnb']) AS d(domain);
END $$;
