-- Công văn có hạn xử lý (of_correspondence.due_at) vào danh sách hạn sắp tới và thông báo nhắc hạn: công văn đến chưa xử lý và công văn đi
-- chưa ban hành. Chỉ NHẮC trong ứng dụng; mỗi (hạn, nhóm) đúng một thông báo cho mỗi người xem được. Phần còn lại giữ nguyên như 0026/0033.
CREATE OR REPLACE FUNCTION of_search_deadlines(p_tenant uuid, p_actor uuid, p_office uuid, p_until timestamptz)
RETURNS TABLE (domain text, ref_id uuid, case_id uuid, label text, deadline_at timestamptz, status text, overdue boolean)
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM vibang_audit(p_tenant, p_actor, 'of.deadlines.search', true, 'ALLOWED', p_office, NULL, NULL);
  RETURN QUERY
  WITH src AS (
    SELECT 'TONG_DAT'::text AS domain, d.id AS ref_id, d.request_id AS case_id, d.recipient_name AS label, d.deadline_at,
           d.status, r.branch_id, d.handler_user_id AS handler
    FROM td_documents d JOIN td_requests r ON r.id = d.request_id AND r.tenant_id = d.tenant_id
    WHERE d.tenant_id = p_tenant AND r.office_id = p_office AND d.status IN ('PENDING', 'ASSIGNED')
    UNION ALL
    SELECT 'VIBANG_CSDL', g.case_id, g.case_id, c.title, g.deadline_at, g.status, c.branch_id, c.responsible_thv_user_id
    FROM vibang_registrations g JOIN vibang_cases c ON c.id = g.case_id AND c.tenant_id = g.tenant_id
    WHERE g.tenant_id = p_tenant AND c.office_id = p_office AND g.status IN ('PENDING', 'SUBMITTED')
    UNION ALL
    SELECT 'CONG_VAN', o.id, CASE WHEN o.case_id IS NULL THEN o.id ELSE o.case_id END, o.subject, o.due_at, o.status, o.branch_id, o.handler_user_id
    FROM of_correspondence o
    WHERE o.tenant_id = p_tenant AND o.office_id = p_office AND o.due_at IS NOT NULL AND o.status IN ('RECEIVED', 'DRAFT', 'SUBMITTED', 'APPROVED')
  )
  SELECT s.domain, s.ref_id, s.case_id, s.label, s.deadline_at, s.status, s.deadline_at < now()
  FROM src s
  WHERE s.deadline_at <= p_until AND of_can_read(p_tenant, p_actor, p_office, s.branch_id, s.handler)
  ORDER BY s.deadline_at, s.ref_id;
END $$;

CREATE OR REPLACE FUNCTION of_sync_notifications(p_tenant uuid, p_actor uuid, p_office uuid, p_within_days integer)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO office_notifications (tenant_id, office_id, user_id, kind, domain, ref_id, case_id, label, deadline_at)
  WITH src AS (
    SELECT 'TONG_DAT'::text AS domain, d.id AS ref_id, d.request_id AS case_id, d.recipient_name AS label, d.deadline_at,
           r.branch_id, d.handler_user_id AS handler
    FROM td_documents d JOIN td_requests r ON r.id = d.request_id AND r.tenant_id = d.tenant_id
    WHERE d.tenant_id = p_tenant AND r.office_id = p_office AND d.status IN ('PENDING', 'ASSIGNED')
    UNION ALL
    SELECT 'VIBANG_CSDL', g.case_id, g.case_id, c.title, g.deadline_at, c.branch_id, c.responsible_thv_user_id
    FROM vibang_registrations g JOIN vibang_cases c ON c.id = g.case_id AND c.tenant_id = g.tenant_id
    WHERE g.tenant_id = p_tenant AND c.office_id = p_office AND g.status IN ('PENDING', 'SUBMITTED')
    UNION ALL
    SELECT 'CONG_VAN', o.id, CASE WHEN o.case_id IS NULL THEN o.id ELSE o.case_id END, o.subject, o.due_at, o.branch_id, o.handler_user_id
    FROM of_correspondence o
    WHERE o.tenant_id = p_tenant AND o.office_id = p_office AND o.due_at IS NOT NULL AND o.status IN ('RECEIVED', 'DRAFT', 'SUBMITTED', 'APPROVED')
  )
  SELECT p_tenant, p_office, p_actor,
         CASE WHEN s.deadline_at < now() THEN 'DEADLINE_OVERDUE' ELSE 'DEADLINE_DUE_SOON' END,
         s.domain, s.ref_id, s.case_id, s.label, s.deadline_at
  FROM src s
  WHERE s.deadline_at <= now() + make_interval(days => p_within_days)
    AND of_can_read(p_tenant, p_actor, p_office, s.branch_id, s.handler)
  ON CONFLICT ON CONSTRAINT office_notifications_once_uq DO NOTHING;
END $$;
