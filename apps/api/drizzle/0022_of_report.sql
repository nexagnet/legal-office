-- Báo cáo tổng hợp theo kỳ. Mỗi dòng đếm ĐÚNG MỘT đơn vị: hồ sơ Vi bằng, số Vi bằng đã cấp, yêu cầu tống đạt, văn bản tống đạt,
-- hồ sơ xác minh, đợt xác minh, hồ sơ thi hành án, nghĩa vụ thi hành án — không cộng chéo đơn vị. Kỳ tính theo ngày tạo
-- (giờ Việt Nam); số Vi bằng tính theo ngày cấp. Không có số tiền. Phạm vi đọc như hồ sơ gốc (of_can_read). Có audit.
CREATE FUNCTION of_search_report(p_tenant uuid, p_actor uuid, p_office uuid, p_from date, p_to date, p_branch uuid)
RETURNS TABLE (domain text, unit text, status text, total integer)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM vibang_audit(p_tenant, p_actor, 'of.report.search', true, 'ALLOWED', p_office, p_branch, NULL);
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN RETURN; END IF;
  RETURN QUERY
  WITH src AS (
    SELECT 'VIBANG'::text AS domain, 'CASE'::text AS unit, c.status, c.branch_id, c.responsible_thv_user_id AS handler,
           (c.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS d
    FROM vibang_cases c WHERE c.tenant_id = p_tenant AND c.office_id = p_office
    UNION ALL
    SELECT 'VIBANG', 'NUMBER', 'ALLOCATED', c.branch_id, c.responsible_thv_user_id, (n.allocated_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    FROM vibang_numbers n JOIN vibang_cases c ON c.id = n.case_id AND c.tenant_id = n.tenant_id
    WHERE n.tenant_id = p_tenant AND n.office_id = p_office
    UNION ALL
    SELECT 'TONG_DAT', 'REQUEST', r.status, r.branch_id, NULL, (r.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    FROM td_requests r WHERE r.tenant_id = p_tenant AND r.office_id = p_office
    UNION ALL
    SELECT 'TONG_DAT', 'DOCUMENT', d.status, r.branch_id, d.handler_user_id, (d.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    FROM td_documents d JOIN td_requests r ON r.id = d.request_id AND r.tenant_id = d.tenant_id
    WHERE d.tenant_id = p_tenant AND r.office_id = p_office
    UNION ALL
    SELECT 'XAC_MINH', 'CASE', x.status, x.branch_id, x.handler_user_id, (x.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    FROM vx_cases x WHERE x.tenant_id = p_tenant AND x.office_id = p_office
    UNION ALL
    SELECT 'XAC_MINH', 'ROUND', o.status, x.branch_id, x.handler_user_id, (o.started_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    FROM vx_rounds o JOIN vx_cases x ON x.id = o.case_id AND x.tenant_id = o.tenant_id
    WHERE o.tenant_id = p_tenant AND x.office_id = p_office
    UNION ALL
    SELECT 'THI_HANH_AN', 'CASE', t.status, t.branch_id, t.handler_user_id, (t.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    FROM th_cases t WHERE t.tenant_id = p_tenant AND t.office_id = p_office
    UNION ALL
    SELECT 'THI_HANH_AN', 'OBLIGATION', g.status, t.branch_id, t.handler_user_id, (g.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
    FROM th_obligations g JOIN th_cases t ON t.id = g.case_id AND t.tenant_id = g.tenant_id
    WHERE g.tenant_id = p_tenant AND t.office_id = p_office
  )
  SELECT s.domain, s.unit, s.status, count(*)::integer
  FROM src s
  WHERE s.d BETWEEN p_from AND p_to
    AND (p_branch IS NULL OR s.branch_id = p_branch)
    AND of_can_read(p_tenant, p_actor, p_office, s.branch_id, s.handler)
  GROUP BY s.domain, s.unit, s.status
  ORDER BY s.domain, s.unit, s.status;
END $$;
