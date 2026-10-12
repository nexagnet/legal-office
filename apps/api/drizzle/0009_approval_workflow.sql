-- Lát #12: quy trình duyệt dùng chung cho chuyển giao hồ sơ (N-08) và uỷ quyền xác minh.
-- Duyệt trong ứng dụng (Admin/Trưởng VP) KHÁC chữ ký pháp lý (legal_signer). Bước duyệt/ký/bàn giao vẫn ghi ở *_steps;
-- lớp này thêm các quyết định TỪ CHỐI / TRẢ LẠI BỔ SUNG / NỘP LẠI (chỉ ghi thêm, có lý do, có audit).
--   REJECT   : chấm dứt đề xuất này; muốn làm lại phải tạo đề xuất mới (không mở lại, không ghi đè).
--   RETURN   : trả lại xin bổ sung; hoàn tất bị chặn tới khi người đề xuất (hoặc Admin/Trưởng VP) RESUBMIT.
-- Hoàn tất chuyển giao / kích hoạt uỷ quyền bị chặn khi đề xuất đang bị từ chối hoặc trả lại.

CREATE TABLE ap_decisions (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  subject_kind text NOT NULL CHECK (subject_kind IN ('TRANSFER', 'DELEGATION')),
  subject_id uuid NOT NULL,
  decision text NOT NULL CHECK (decision IN ('REJECT', 'RETURN', 'RESUBMIT')),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  actor_user_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ap_decisions_subject_idx ON ap_decisions (tenant_id, subject_kind, subject_id, id DESC);
CREATE TRIGGER ap_decisions_ro BEFORE UPDATE OR DELETE ON ap_decisions FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
ALTER TABLE ap_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ap_decisions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ap_decisions USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

-- Trạng thái duyệt hiện tại: NULL = đang mở; mã chặn nếu bị từ chối / trả lại.
CREATE FUNCTION ap_blocked(p_kind text, p_subject uuid, p_tenant uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE d.decision WHEN 'REJECT' THEN 'APPROVAL_REJECTED' WHEN 'RETURN' THEN 'APPROVAL_RETURNED' ELSE NULL END
  FROM (SELECT decision FROM ap_decisions WHERE tenant_id = p_tenant AND subject_kind = p_kind AND subject_id = p_subject
        ORDER BY id DESC LIMIT 1) d
$$;

-- Quyết định duyệt. p_decision: REJECT | RETURN | RESUBMIT.
CREATE FUNCTION ap_decide(p_tenant uuid, p_actor uuid, p_kind text, p_subject uuid, p_decision text, p_reason text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE office uuid; branch uuid; proposer uuid; handler uuid; done boolean; denied text; cur text; roles text[];
BEGIN
  IF p_kind NOT IN ('TRANSFER', 'DELEGATION') THEN RETURN vibang_audit(p_tenant, p_actor, 'ap.decide', false, 'INVALID_SUBJECT_KIND', NULL, NULL, NULL); END IF;
  IF p_kind = 'TRANSFER' THEN
    SELECT c.office_id, c.branch_id, t.proposed_by, c.handler_user_id, t.status = 'COMPLETED' INTO office, branch, proposer, handler, done
    FROM as_transfers t JOIN th_cases c ON c.id = t.case_id AND c.tenant_id = t.tenant_id
    WHERE t.id = p_subject AND t.tenant_id = p_tenant FOR UPDATE OF t;
  ELSE
    SELECT c.office_id, c.branch_id, d.requested_by, c.handler_user_id, d.status = 'ACTIVE' INTO office, branch, proposer, handler, done
    FROM vx_delegations d JOIN vx_cases c ON c.id = d.case_id AND c.tenant_id = d.tenant_id
    WHERE d.id = p_subject AND d.tenant_id = p_tenant FOR UPDATE OF d;
  END IF;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'ap.decide', false, 'SUBJECT_NOT_FOUND', NULL, NULL, NULL); END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('REJECT', 'RETURN', 'RESUBMIT') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ap.decide', false, 'INVALID_DECISION', office, branch, NULL);
  END IF;
  roles := CASE WHEN p_decision = 'RESUBMIT' THEN ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'THV'] ELSE ARRAY['ADMIN', 'TRUONG_VP'] END;
  denied := td_authorize(p_tenant, p_actor, office, branch, roles, handler);
  IF denied IS NOT NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ap.decide', false, CASE WHEN p_decision = 'RESUBMIT' THEN denied ELSE 'ADMIN_OR_HEAD_ONLY' END, office, branch, NULL);
  END IF;
  IF p_decision = 'RESUBMIT' AND p_actor <> proposer AND NOT EXISTS (
       SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = office AND m.role IN ('ADMIN', 'TRUONG_VP')) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ap.decide', false, 'PROPOSER_ONLY', office, branch, NULL);
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RETURN vibang_audit(p_tenant, p_actor, 'ap.decide', false, 'REASON_REQUIRED', office, branch, NULL); END IF;
  IF done THEN RETURN vibang_audit(p_tenant, p_actor, 'ap.decide', false, 'SUBJECT_FINAL', office, branch, NULL); END IF;
  cur := ap_blocked(p_kind, p_subject, p_tenant);
  IF cur = 'APPROVAL_REJECTED' THEN RETURN vibang_audit(p_tenant, p_actor, 'ap.decide', false, 'ALREADY_REJECTED', office, branch, NULL); END IF;
  IF p_decision = 'RESUBMIT' AND cur IS DISTINCT FROM 'APPROVAL_RETURNED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ap.decide', false, 'NOT_RETURNED', office, branch, NULL);
  END IF;
  IF p_decision = 'RETURN' AND cur = 'APPROVAL_RETURNED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'ap.decide', false, 'ALREADY_RETURNED', office, branch, NULL);
  END IF;
  INSERT INTO ap_decisions (tenant_id, subject_kind, subject_id, decision, reason, actor_user_id)
  VALUES (p_tenant, p_kind, p_subject, p_decision, btrim(p_reason), p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'ap.decide', true, 'ALLOWED', office, branch, p_decision);
END $$;

-- Lịch sử quyết định của một đề xuất (không phụ thuộc quyền xem hồ sơ chi tiết; RLS theo tenant).
CREATE VIEW ap_history WITH (security_invoker = true) AS
SELECT tenant_id, subject_kind, subject_id, id, decision, reason, actor_user_id, at FROM ap_decisions;

CREATE OR REPLACE FUNCTION as_transfer_complete(p_tenant uuid, p_actor uuid, p_transfer uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE t as_transfers%ROWTYPE; c th_cases%ROWTYPE; denied text; missing text;
BEGIN
  SELECT * INTO t FROM as_transfers WHERE id = p_transfer AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'as.transfer.complete', false, 'TRANSFER_NOT_FOUND', NULL, NULL, NULL); END IF;
  SELECT * INTO c FROM th_cases WHERE id = t.case_id AND tenant_id = p_tenant FOR UPDATE;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'as.transfer.complete', false, 'ADMIN_OR_HEAD_ONLY', c.office_id, c.branch_id, NULL); END IF;
  IF t.status <> 'PROPOSED' OR c.status <> 'OPEN' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'as.transfer.complete', false, 'TRANSFER_NOT_PENDING', c.office_id, c.branch_id, NULL);
  END IF;
  missing := ap_blocked('TRANSFER', p_transfer, p_tenant);
  IF missing IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'as.transfer.complete', false, missing, c.office_id, c.branch_id, NULL); END IF;
  SELECT x.code INTO missing FROM (VALUES (1, 'APP_APPROVAL', 'APP_APPROVAL_MISSING'), (2, 'LEGAL_DECISION', 'LEGAL_DECISION_MISSING'),
      (3, 'HANDOVER_N08', 'HANDOVER_N08_MISSING')) AS x(ord, step, code)
    WHERE NOT EXISTS (SELECT 1 FROM as_transfer_steps s WHERE s.transfer_id = p_transfer AND s.tenant_id = p_tenant AND s.step = x.step)
    ORDER BY x.ord LIMIT 1;
  IF missing IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'as.transfer.complete', false, missing, c.office_id, c.branch_id, NULL); END IF;
  UPDATE as_transfers SET status = 'COMPLETED', completed_at = now() WHERE id = p_transfer AND tenant_id = p_tenant;
  UPDATE th_cases SET handler_user_id = t.to_user_id WHERE id = t.case_id AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'as.transfer.complete', true, 'ALLOWED', c.office_id, c.branch_id, NULL);
END $$;

CREATE OR REPLACE FUNCTION vx_delegation_activate(p_tenant uuid, p_actor uuid, p_delegation uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE d vx_delegations%ROWTYPE; c vx_cases%ROWTYPE; denied text; missing text;
BEGIN
  SELECT * INTO d FROM vx_delegations WHERE id = p_delegation AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.delegation.activate', false, 'DELEGATION_NOT_FOUND', NULL, NULL, NULL); END IF;
  SELECT * INTO c FROM vx_cases WHERE id = d.case_id AND tenant_id = p_tenant FOR UPDATE;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.delegation.activate', false, 'ADMIN_OR_HEAD_ONLY', c.office_id, c.branch_id, NULL); END IF;
  IF d.status <> 'PENDING' OR c.status = 'CONCLUDED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.delegation.activate', false, 'DELEGATION_NOT_PENDING', c.office_id, c.branch_id, NULL);
  END IF;
  missing := ap_blocked('DELEGATION', p_delegation, p_tenant);
  IF missing IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.delegation.activate', false, missing, c.office_id, c.branch_id, NULL); END IF;
  SELECT x.code INTO missing FROM (VALUES (1, 'CONSENT', 'CONSENT_MISSING'), (2, 'APP_APPROVAL', 'APP_APPROVAL_MISSING'),
      (3, 'LEGAL_SIGNATURE', 'LEGAL_SIGNATURE_MISSING'), (4, 'HANDOVER', 'HANDOVER_MISSING')) AS x(ord, step, code)
    WHERE NOT EXISTS (SELECT 1 FROM vx_delegation_steps s WHERE s.delegation_id = p_delegation AND s.tenant_id = p_tenant AND s.step = x.step)
    ORDER BY x.ord LIMIT 1;
  IF missing IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.delegation.activate', false, missing, c.office_id, c.branch_id, NULL); END IF;
  UPDATE vx_delegations SET status = 'ACTIVE', activated_at = now() WHERE id = p_delegation AND tenant_id = p_tenant;
  UPDATE vx_cases SET handler_user_id = d.delegate_user_id WHERE id = d.case_id AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'vx.delegation.activate', true, 'ALLOWED', c.office_id, c.branch_id, NULL);
END $$;
