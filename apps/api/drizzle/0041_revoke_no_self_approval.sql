-- Chặn tự duyệt đề nghị thu hồi xác nhận MISA của chính mình (nghiệp vụ §4.6). Chỉ thêm một điều kiện; còn lại giữ nguyên 0002.
CREATE OR REPLACE FUNCTION vibang_decide_revoke(p_tenant uuid, p_case uuid, p_actor uuid, p_accept boolean)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vibang_cases%ROWTYPE; s vibang_misa_confirmations%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM vibang_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.decide_revoke', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := vibang_actor_check(p_tenant, p_actor, c.office_id, c.branch_id, 'ADMIN', false);
  IF denied IS NOT NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.decide_revoke', false, CASE WHEN denied = 'ROLE_LACKS_PERMISSION' THEN 'ADMIN_ONLY' ELSE denied END, c.office_id, c.branch_id, NULL);
  END IF;
  IF c.status IN ('RETURNED', 'CANCELLED') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.decide_revoke', false, 'CASE_FINAL', c.office_id, c.branch_id, NULL);
  END IF;
  SELECT * INTO s FROM vibang_misa_confirmations WHERE case_id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND OR s.revoke_status <> 'PROPOSED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.decide_revoke', false, 'NO_PENDING_REVOKE', c.office_id, c.branch_id, NULL);
  END IF;
  -- Nghiệp vụ §4.6: người đề nghị thu hồi không được tự duyệt đề nghị của mình (kể cả khi giữ thêm vai Admin).
  IF s.revoke_proposed_by = p_actor THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.decide_revoke', false, 'SELF_APPROVAL', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_accept THEN
    UPDATE vibang_misa_confirmations SET status = 'NOT_CONFIRMED', reference = NULL, confirmed_by = NULL,
      confirmed_at = NULL, revoke_status = 'NONE', updated_at = now() WHERE case_id = p_case AND tenant_id = p_tenant;
  ELSE
    UPDATE vibang_misa_confirmations SET revoke_status = 'NONE', updated_at = now()
    WHERE case_id = p_case AND tenant_id = p_tenant;
  END IF;
  INSERT INTO vibang_misa_events (tenant_id, case_id, event, actor_user_id, reason)
  VALUES (p_tenant, p_case, CASE WHEN p_accept THEN 'REVOKE_ACCEPTED' ELSE 'REVOKE_REJECTED' END, p_actor, s.revoke_reason);
  RETURN vibang_audit(p_tenant, p_actor, 'vibang.misa.decide_revoke', true, 'ALLOWED', c.office_id, c.branch_id, NULL);
END $$;
