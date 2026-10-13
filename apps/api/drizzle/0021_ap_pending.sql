-- Hộp duyệt: các đề xuất chuyển giao hồ sơ và uỷ quyền xác minh chưa hoàn tất, kèm trạng thái duyệt hiện tại
-- (OPEN | RETURNED | REJECTED) và lý do gần nhất. Phạm vi đọc như hồ sơ gốc (of_can_read: quản lý cả văn phòng,
-- Văn thư/Kế toán theo chi nhánh được cấp, THV chỉ hồ sơ mình phụ trách). Chỉ đọc, có audit.
CREATE FUNCTION of_search_approvals(p_tenant uuid, p_actor uuid, p_office uuid)
RETURNS TABLE (kind text, subject_id uuid, case_id uuid, branch_id uuid, approval_state text, last_reason text, proposed_by uuid, created_at timestamptz)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM vibang_audit(p_tenant, p_actor, 'ap.search', true, 'ALLOWED', p_office, NULL, NULL);
  RETURN QUERY
    SELECT x.kind, x.subject_id, x.case_id, x.branch_id,
           CASE ap_blocked(x.kind, x.subject_id, p_tenant)
             WHEN 'APPROVAL_REJECTED' THEN 'REJECTED' WHEN 'APPROVAL_RETURNED' THEN 'RETURNED' ELSE 'OPEN' END,
           (SELECT d.reason FROM ap_decisions d WHERE d.tenant_id = p_tenant AND d.subject_kind = x.kind AND d.subject_id = x.subject_id
              ORDER BY d.id DESC LIMIT 1),
           x.proposer, x.created_at
    FROM (
      SELECT 'TRANSFER'::text AS kind, t.id AS subject_id, c.id AS case_id, c.branch_id, t.proposed_by AS proposer, t.created_at,
             c.office_id, c.handler_user_id
      FROM as_transfers t JOIN th_cases c ON c.id = t.case_id AND c.tenant_id = t.tenant_id
      WHERE t.tenant_id = p_tenant AND t.status = 'PROPOSED'
      UNION ALL
      SELECT 'DELEGATION', d.id, c.id, c.branch_id, d.requested_by, d.created_at, c.office_id, c.handler_user_id
      FROM vx_delegations d JOIN vx_cases c ON c.id = d.case_id AND c.tenant_id = d.tenant_id
      WHERE d.tenant_id = p_tenant AND d.status = 'PENDING'
    ) x
    WHERE x.office_id = p_office AND of_can_read(p_tenant, p_actor, x.office_id, x.branch_id, x.handler_user_id)
    ORDER BY x.created_at DESC, x.subject_id LIMIT 200;
END $$;
