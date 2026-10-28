-- Xác minh (Figma N17 X1, X2, X3): đọc nguồn và ủy quyền của hồ sơ, nhật ký mở nguồn, ghi quyết định N-06.
-- Dữ liệu giả lập. Không trả khoá bằng chứng hay hash; chỉ cho biết có bằng chứng.

-- 1) Nhật ký mở nguồn: mỗi lần truy cập thành công một nguồn ghi một dòng (chỉ ghi thêm), kèm mục đích.
CREATE TABLE vx_source_accesses (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  source_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  purpose text,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vx_source_accesses_fk FOREIGN KEY (source_id, tenant_id) REFERENCES vx_sources (id, tenant_id)
);
CREATE TRIGGER vx_source_accesses_ro BEFORE UPDATE OR DELETE ON vx_source_accesses
  FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
ALTER TABLE vx_source_accesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE vx_source_accesses FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON vx_source_accesses
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE OR REPLACE FUNCTION vx_access_source(p_tenant uuid, p_actor uuid, p_source uuid, p_purpose text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE s vx_sources%ROWTYPE; r vx_rounds%ROWTYPE; c vx_cases%ROWTYPE; denied text;
BEGIN
  SELECT * INTO s FROM vx_sources WHERE id = p_source AND tenant_id = p_tenant;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.source.access', false, 'SOURCE_NOT_FOUND', NULL, NULL, NULL); END IF;
  SELECT * INTO r FROM vx_rounds WHERE id = s.round_id AND tenant_id = p_tenant;
  SELECT * INTO c FROM vx_cases WHERE id = r.case_id AND tenant_id = p_tenant;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THV'], c.handler_user_id);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.source.access', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF s.confidentiality <> 'PUBLIC' AND btrim(coalesce(p_purpose, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.source.access', false, 'PURPOSE_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  INSERT INTO vx_source_accesses (tenant_id, source_id, actor_user_id, purpose) VALUES (p_tenant, p_source, p_actor, nullif(btrim(p_purpose), ''));
  RETURN vibang_audit(p_tenant, p_actor, 'vx.source.access', true, 'ALLOWED', c.office_id, c.branch_id, s.evidence_key);
END $$;

-- 2) Nguồn của hồ sơ kèm nhật ký mở. Cùng phạm vi xem với vx_list_cases.
CREATE FUNCTION vx_list_sources(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (id uuid, round_id uuid, round_seq integer, kind text, confidentiality text, purpose text, recorded_by uuid,
  at timestamptz, accesses jsonb)
LANGUAGE sql STABLE AS $$
  SELECT s.id, s.round_id, r.seq, s.kind, s.confidentiality, s.purpose, s.recorded_by, s.at,
         coalesce((SELECT jsonb_agg(jsonb_build_object('actorUserId', x.actor_user_id, 'purpose', x.purpose, 'at', x.at) ORDER BY x.at, x.id)
                   FROM vx_source_accesses x WHERE x.source_id = s.id AND x.tenant_id = s.tenant_id), '[]'::jsonb)
  FROM vx_sources s
  JOIN vx_rounds r ON r.id = s.round_id AND r.tenant_id = s.tenant_id
  JOIN vx_cases c ON c.id = r.case_id AND c.tenant_id = r.tenant_id
  WHERE s.tenant_id = p_tenant AND c.id = p_case
    AND td_authorize(p_tenant, p_actor, c.office_id, c.branch_id,
                     ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU', 'KE_TOAN', 'THV'], c.handler_user_id) IS NULL
  ORDER BY r.seq, s.at, s.id
$$;

-- 3) Ủy quyền của hồ sơ kèm các bước đã ghi.
CREATE FUNCTION vx_list_delegations(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (id uuid, delegate_user_id uuid, status text, requested_by uuid, created_at timestamptz, activated_at timestamptz, steps jsonb)
LANGUAGE sql STABLE AS $$
  SELECT d.id, d.delegate_user_id, d.status, d.requested_by, d.created_at, d.activated_at,
         coalesce((SELECT jsonb_agg(jsonb_build_object('step', s.step, 'actorUserId', s.actor_user_id, 'at', s.at) ORDER BY s.at, s.id)
                   FROM vx_delegation_steps s WHERE s.delegation_id = d.id AND s.tenant_id = d.tenant_id), '[]'::jsonb)
  FROM vx_delegations d
  JOIN vx_cases c ON c.id = d.case_id AND c.tenant_id = d.tenant_id
  WHERE d.tenant_id = p_tenant AND c.id = p_case
    AND td_authorize(p_tenant, p_actor, c.office_id, c.branch_id,
                     ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU', 'KE_TOAN', 'THV'], c.handler_user_id) IS NULL
  ORDER BY d.created_at, d.id
$$;

-- 4) Quyết định N-06 (Điều 35.1): Trưởng VP có quyền ký pháp lý ra quyết định xác minh trong 3 ngày làm việc kể từ ngày ký hợp đồng.
-- Mỗi hồ sơ một quyết định, bất biến. Ghi xong thì đóng hạn VX_DECISION còn mở.
CREATE TABLE vx_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  decision_no text NOT NULL CHECK (btrim(decision_no) <> ''),
  signed_on date NOT NULL,
  evidence_key text NOT NULL CHECK (btrim(evidence_key) <> '' AND evidence_key !~ '(^/|\.\.)'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  signer_user_id uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vx_decisions_case_uq UNIQUE (case_id),
  CONSTRAINT vx_decisions_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES vx_cases (id, tenant_id)
);
CREATE TRIGGER vx_decisions_ro BEFORE UPDATE OR DELETE ON vx_decisions
  FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
ALTER TABLE vx_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vx_decisions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON vx_decisions
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE FUNCTION vx_record_decision(p_tenant uuid, p_actor uuid, p_case uuid, p_no text, p_signed_on date, p_key text, p_sha text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vx_cases%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM vx_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.decision.record', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.decision.record', false, 'ADMIN_OR_HEAD_ONLY', c.office_id, c.branch_id, NULL); END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = c.office_id
                 AND m.role IN ('ADMIN', 'TRUONG_VP') AND m.legal_signer) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.decision.record', false, 'SIGNING_AUTHORITY_NOT_GRANTED', c.office_id, c.branch_id, NULL);
  END IF;
  IF EXISTS (SELECT 1 FROM vx_decisions d WHERE d.case_id = p_case AND d.tenant_id = p_tenant) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.decision.record', false, 'ALREADY_DONE', c.office_id, c.branch_id, NULL);
  END IF;
  IF btrim(coalesce(p_no, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.decision.record', false, 'INVALID_DECISION', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_signed_on IS NULL OR p_signed_on > (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.decision.record', false, 'INVALID_DATE', c.office_id, c.branch_id, NULL);
  END IF;
  IF NOT vx_valid_evidence(p_key, p_sha) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.decision.record', false, 'INVALID_EVIDENCE', c.office_id, c.branch_id, NULL);
  END IF;
  INSERT INTO vx_decisions (tenant_id, case_id, decision_no, signed_on, evidence_key, evidence_sha256, signer_user_id)
  VALUES (p_tenant, p_case, btrim(p_no), p_signed_on, p_key, p_sha, p_actor);
  UPDATE office_statutory_deadlines
     SET status = 'DONE', done_by = p_actor, done_at = now(), done_note = 'Đã ra quyết định N-06 số ' || btrim(p_no)
   WHERE tenant_id = p_tenant AND kind = 'VX_DECISION' AND ref_id = p_case AND status = 'OPEN';
  RETURN vibang_audit(p_tenant, p_actor, 'vx.decision.record', true, 'ALLOWED', c.office_id, c.branch_id, btrim(p_no));
END $$;

CREATE FUNCTION vx_get_decision(p_tenant uuid, p_actor uuid, p_case uuid)
RETURNS TABLE (decision_no text, signed_on date, signer_user_id uuid, recorded_at timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT d.decision_no, d.signed_on, d.signer_user_id, d.recorded_at
  FROM vx_decisions d JOIN vx_cases c ON c.id = d.case_id AND c.tenant_id = d.tenant_id
  WHERE d.tenant_id = p_tenant AND d.case_id = p_case
    AND td_authorize(p_tenant, p_actor, c.office_id, c.branch_id,
                     ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU', 'KE_TOAN', 'THV'], c.handler_user_id) IS NULL
$$;
