-- Lưu thời điểm huỷ hồ sơ để tab Lịch sử có mốc "Huỷ". Đặt bằng trigger nên phủ cả huỷ thường (vibang_cancel...) lẫn từ chối theo Điều 28.
-- Hồ sơ đã huỷ trước migration này không có thời điểm (không suy đoán). Người huỷ chưa được lưu. Dữ liệu giả lập.
ALTER TABLE vibang_cases ADD COLUMN cancelled_at timestamptz;

CREATE FUNCTION vibang_cases_cancel_stamp() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'CANCELLED' AND OLD.status <> 'CANCELLED' AND NEW.cancelled_at IS NULL THEN
    NEW.cancelled_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER vibang_cases_cancel_stamp_trg BEFORE UPDATE ON vibang_cases
  FOR EACH ROW EXECUTE FUNCTION vibang_cases_cancel_stamp();

CREATE OR REPLACE FUNCTION vb_case_history(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (at timestamptz, kind text, actor_user_id uuid, actor_label text, detail text)
LANGUAGE plpgsql STABLE AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH ev AS (
    SELECT c.created_at AS at, 'CASE_CREATED'::text AS kind, c.created_by AS actor, NULL::text AS detail
      FROM vibang_cases c WHERE c.id = p_case AND c.tenant_id = p_tenant
    UNION ALL SELECT c.cancelled_at, 'CANCELLED', NULL::uuid, c.cancel_reason
      FROM vibang_cases c WHERE c.id = p_case AND c.tenant_id = p_tenant AND c.cancelled_at IS NOT NULL
    UNION ALL SELECT a.at, CASE WHEN a.previous_thv_user_id IS NULL THEN 'THV_ASSIGNED' ELSE 'THV_CHANGED' END, a.assigned_by, a.reason
      FROM vibang_assignments a WHERE a.case_id = p_case AND a.tenant_id = p_tenant
    UNION ALL SELECT m.at, 'MISA_' || m.event, m.actor_user_id, coalesce(m.reference, m.reason)
      FROM vibang_misa_events m WHERE m.case_id = p_case AND m.tenant_id = p_tenant
    UNION ALL SELECT n.allocated_at, 'NUMBER_ALLOCATED', n.allocated_by, n.label
      FROM vibang_numbers n WHERE n.case_id = p_case AND n.tenant_id = p_tenant
    UNION ALL SELECT d.created_at, 'DOCUMENT_ADDED', d.created_by, d.kind || ' v' || d.version
      FROM vibang_documents d WHERE d.case_id = p_case AND d.tenant_id = p_tenant
    UNION ALL SELECT e.signed_at, 'SIGNED', e.signed_by, NULL FROM vibang_evidence e WHERE e.case_id = p_case AND e.tenant_id = p_tenant AND e.signed_at IS NOT NULL
    UNION ALL SELECT e.stamped_at, 'STAMPED', e.stamped_by, NULL FROM vibang_evidence e WHERE e.case_id = p_case AND e.tenant_id = p_tenant AND e.stamped_at IS NOT NULL
    UNION ALL SELECT h.recorded_at, 'HANDOVER', h.recorded_by, NULL FROM vibang_handovers h WHERE h.case_id = p_case AND h.tenant_id = p_tenant
    UNION ALL SELECT r.created_at, 'CHANGE_REQUESTED', CASE WHEN r.requested_by ~ '^[0-9a-f-]{36}$' THEN r.requested_by::uuid END, r.reason
      FROM vibang_case_change_requests r WHERE r.case_id = p_case AND r.tenant_id = p_tenant
    UNION ALL SELECT r.decided_at, 'CHANGE_' || r.status, CASE WHEN r.decided_by ~ '^[0-9a-f-]{36}$' THEN r.decided_by::uuid END, NULL
      FROM vibang_case_change_requests r WHERE r.case_id = p_case AND r.tenant_id = p_tenant AND r.decided_at IS NOT NULL
    UNION ALL SELECT j.created_at, 'REJECTED', j.rejected_by, 'khoản ' || j.clause
      FROM vibang_rejections j WHERE j.case_id = p_case AND j.tenant_id = p_tenant
    UNION ALL SELECT i.issued_at, 'COPY_ISSUED', i.issued_by, i.kind || ' x' || i.copies
      FROM vibang_copy_issuances i WHERE i.case_id = p_case AND i.tenant_id = p_tenant
    UNION ALL SELECT l.at, 'CONTACT_' || l.kind, l.actor_user_id, l.outcome
      FROM vibang_contact_log l WHERE l.case_id = p_case AND l.tenant_id = p_tenant
    UNION ALL SELECT o.requested_at, 'N11_PROPOSED', o.requested_by, o.reason
      FROM vibang_n11_corrections o WHERE o.case_id = p_case AND o.tenant_id = p_tenant
    UNION ALL SELECT o.applied_at, 'N11_APPLIED', o.signatory_user_id, NULL
      FROM vibang_n11_corrections o WHERE o.case_id = p_case AND o.tenant_id = p_tenant AND o.applied_at IS NOT NULL
  )
  SELECT ev.at, ev.kind, ev.actor,
         (SELECT coalesce(ac.email, u.external_ref) FROM users u
            LEFT JOIN auth_credentials ac ON ac.user_id = u.id AND ac.tenant_id = u.tenant_id
           WHERE u.id = ev.actor AND u.tenant_id = p_tenant),
         ev.detail
  FROM ev
  WHERE EXISTS (SELECT 1 FROM vb_list_cases(p_tenant, p_actor, p_case, 1))
  ORDER BY ev.at, ev.kind;
END $$;

