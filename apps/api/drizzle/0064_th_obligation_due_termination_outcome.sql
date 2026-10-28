-- Thi hành án (Figma N17 H1, H4): hạn của nghĩa vụ, kết quả từng phần hiện cùng nghĩa vụ, kết quả thực tế khi chấm dứt (Điều 46).
-- Dữ liệu giả lập; không số tiền. Hàm cũ giữ nguyên để lời gọi cũ không hỏng; API mới dùng bản có thêm tham số.

ALTER TABLE th_obligations ADD COLUMN due_on date;
ALTER TABLE th_cases ADD COLUMN terminated_outcome text CHECK (terminated_outcome IS NULL OR btrim(terminated_outcome) <> '');

-- Thêm nghĩa vụ kèm hạn (không bắt buộc). Cùng quyền và kiểm tra với bản không có hạn; hạn chỉ ghi khi thêm thành công.
CREATE FUNCTION th_add_obligation(p_tenant uuid, p_actor uuid, p_case uuid, p_description text, p_obligor uuid, p_due date)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE r vibang_op;
BEGIN
  r := th_add_obligation(p_tenant, p_actor, p_case, p_description, p_obligor);
  IF r.ok AND p_due IS NOT NULL THEN
    UPDATE th_obligations SET due_on = p_due WHERE id = r.label::uuid AND tenant_id = p_tenant;
  END IF;
  RETURN r;
END $$;

-- Chấm dứt kèm kết quả thực tế (bắt buộc), ghi cùng lúc với trạng thái chấm dứt vì hồ sơ khoá ngay sau đó (Điều 46).
CREATE FUNCTION th_terminate_case(p_tenant uuid, p_actor uuid, p_case uuid, p_reason text, p_basis text, p_key text, p_sha text, p_outcome text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c th_cases%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM th_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'th.case.terminate', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'th.case.terminate', false, 'ADMIN_OR_HEAD_ONLY', c.office_id, c.branch_id, NULL); END IF;
  IF c.status <> 'OPEN' THEN RETURN vibang_audit(p_tenant, p_actor, 'th.case.terminate', false, 'CASE_NOT_OPEN', c.office_id, c.branch_id, NULL); END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('AGREEMENT', 'REQUESTER_WITHDRAWAL', 'NO_CONDITIONS', 'OTHER') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'th.case.terminate', false, 'INVALID_REASON', c.office_id, c.branch_id, NULL);
  END IF;
  IF btrim(coalesce(p_basis, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'th.case.terminate', false, 'BASIS_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  IF btrim(coalesce(p_outcome, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'th.case.terminate', false, 'OUTCOME_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  IF NOT vx_valid_evidence(p_key, p_sha) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'th.case.terminate', false, 'INVALID_EVIDENCE', c.office_id, c.branch_id, NULL);
  END IF;
  UPDATE th_cases SET status = 'TERMINATED', terminated_reason = p_reason, terminated_basis = btrim(p_basis),
    terminated_outcome = btrim(p_outcome), terminated_evidence_key = p_key, terminated_evidence_sha256 = p_sha,
    terminated_by = p_actor, terminated_at = now()
  WHERE id = p_case AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'th.case.terminate', true, 'ALLOWED', c.office_id, c.branch_id, p_reason);
END $$;

-- Thông tin chấm dứt của hồ sơ (chưa chấm dứt thì không có dòng). Cùng phạm vi xem với th_list_cases; không trả khoá/hash tệp.
CREATE FUNCTION th_get_termination(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (reason text, basis text, outcome text, terminated_at timestamptz, terminated_by uuid)
LANGUAGE sql STABLE AS $$
  SELECT c.terminated_reason, c.terminated_basis, c.terminated_outcome, c.terminated_at, c.terminated_by
  FROM th_cases c
  WHERE c.id = p_case AND c.tenant_id = p_tenant AND c.status = 'TERMINATED'
    AND td_authorize(p_tenant, p_actor, c.office_id, c.branch_id,
                     ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU', 'KE_TOAN', 'THV'], c.handler_user_id) IS NULL
$$;

-- Danh sách hồ sơ THA: nghĩa vụ thêm hạn (dueOn) và các kết quả từng phần đã ghi (events: loại, ghi chú, thời điểm, có bằng chứng).
-- Cùng chữ ký và cùng phạm vi xem với bản cũ (0017).
CREATE OR REPLACE FUNCTION th_list_cases(p_tenant uuid, p_actor uuid, p_limit integer)
RETURNS TABLE (case_id uuid, case_ref text, agreement_ref text, decision_ref text, branch_id uuid, status text,
  handler_user_id uuid, created_at timestamptz, parties jsonb, obligations jsonb)
LANGUAGE sql STABLE AS $$
  SELECT c.id, c.case_ref, c.agreement_ref, c.decision_ref, c.branch_id, c.status, c.handler_user_id, c.created_at,
         coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'displayName', p.display_name, 'kind', p.kind,
                                                        'role', p.role) ORDER BY p.created_at, p.id)
                   FROM th_parties p WHERE p.case_id = c.id AND p.tenant_id = c.tenant_id), '[]'::jsonb),
         coalesce((SELECT jsonb_agg(jsonb_build_object('id', o.id, 'seq', o.seq, 'description', o.description,
                                                        'status', o.status, 'obligorPartyId', o.obligor_party_id,
                                                        'dueOn', o.due_on,
                                                        'events', coalesce((SELECT jsonb_agg(jsonb_build_object('kind', e.kind, 'note', e.note, 'at', e.at,
                                                                                                                  'hasEvidence', e.evidence_key IS NOT NULL) ORDER BY e.at, e.id)
                                                                            FROM th_obligation_events e WHERE e.obligation_id = o.id AND e.tenant_id = o.tenant_id), '[]'::jsonb))
                                    ORDER BY o.seq)
                   FROM th_obligations o WHERE o.case_id = c.id AND o.tenant_id = c.tenant_id), '[]'::jsonb)
  FROM th_cases c
  WHERE c.tenant_id = p_tenant
    AND td_authorize(p_tenant, p_actor, c.office_id, c.branch_id,
                     ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU', 'KE_TOAN', 'THV'], c.handler_user_id) IS NULL
  ORDER BY c.created_at DESC, c.id
  LIMIT greatest(1, least(coalesce(p_limit, 100), 200))
$$;
