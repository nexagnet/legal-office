-- Báo cáo tổng hợp theo kỳ, CHIA THEO Thừa hành viên (THV) hoặc chi nhánh (địa điểm). Cùng nguồn đếm và phạm vi quyền với of_search_report;
-- mỗi dòng vẫn đếm đúng một đơn vị, không cộng chéo. p_group_by = 'THV' | 'BRANCH'. Nhóm THV rỗng = chưa giao người phụ trách.
-- Không có số tiền. Có audit.
CREATE FUNCTION of_search_report_by(p_tenant uuid, p_actor uuid, p_office uuid, p_from date, p_to date, p_branch uuid, p_group_by text)
RETURNS TABLE (group_id uuid, group_label text, domain text, unit text, status text, total integer)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM vibang_audit(p_tenant, p_actor, 'of.report.search_by', true, 'ALLOWED', p_office, p_branch, p_group_by);
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to OR p_group_by NOT IN ('THV', 'BRANCH') THEN RETURN; END IF;
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
  , grp AS (
    SELECT s.*, CASE WHEN p_group_by = 'THV' THEN s.handler ELSE s.branch_id END AS gid
    FROM src s
    WHERE s.d BETWEEN p_from AND p_to
      AND (p_branch IS NULL OR s.branch_id = p_branch)
      AND of_can_read(p_tenant, p_actor, p_office, s.branch_id, s.handler)
  )
  SELECT g.gid,
         CASE WHEN p_group_by = 'THV' THEN coalesce((SELECT coalesce(ac.email, u.external_ref) FROM users u
                                                       LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id
                                                      WHERE u.id = g.gid AND u.tenant_id = p_tenant), 'Chưa giao')
              ELSE coalesce((SELECT b.name FROM branches b WHERE b.id = g.gid AND b.tenant_id = p_tenant), '') END,
         g.domain, g.unit, g.status, count(*)::integer
  FROM grp g
  GROUP BY g.gid, g.domain, g.unit, g.status
  ORDER BY 2, g.domain, g.unit, g.status;
END $$;
