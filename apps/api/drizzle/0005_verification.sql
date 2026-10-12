-- Lát #10: Xác minh điều kiện (N-05/N-06). Một hồ sơ nhiều vòng xác minh; mỗi vòng có bên liên quan, nguồn, kết quả.
-- Kết luận toàn hồ sơ tách riêng: THV đề xuất, người KHÁC (Admin/Trưởng VP có cấp ký pháp lý) quyết định; không suy ra từ
-- một vòng hay từ AI. Ủy quyền cần: đồng ý bằng văn bản của người yêu cầu, duyệt trong ứng dụng (Admin/Trưởng VP),
-- chữ ký pháp lý (thành viên legal_signer), biên bản bàn giao. Dữ liệu giả lập. Không crawl, không tài chính.
-- Dùng lại td_authorize (0004) và vibang_audit (0002).

CREATE TABLE vx_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  office_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  case_ref text NOT NULL CHECK (btrim(case_ref) <> ''),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CONCLUSION_PROPOSED', 'CONCLUDED')),
  handler_user_id uuid,
  conclusion_text text,
  proposed_by uuid,
  decided_by uuid,
  decided_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vx_cases_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT vx_cases_branch_fk FOREIGN KEY (branch_id, tenant_id, office_id) REFERENCES branches (id, tenant_id, office_id),
  CONSTRAINT vx_cases_handler_fk FOREIGN KEY (handler_user_id, tenant_id) REFERENCES users (id, tenant_id),
  CONSTRAINT vx_cases_conclusion_chk CHECK (
    (status = 'OPEN' AND proposed_by IS NULL AND decided_by IS NULL)
    OR (status = 'CONCLUSION_PROPOSED' AND proposed_by IS NOT NULL AND btrim(coalesce(conclusion_text, '')) <> '' AND decided_by IS NULL)
    OR (status = 'CONCLUDED' AND proposed_by IS NOT NULL AND btrim(coalesce(conclusion_text, '')) <> ''
        AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND decided_by <> proposed_by)
  )
);

CREATE TABLE vx_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  seq integer NOT NULL CHECK (seq >= 1),
  party_name text NOT NULL CHECK (btrim(party_name) <> ''),
  status text NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
  result text,
  started_by uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_by uuid,
  completed_at timestamptz,
  CONSTRAINT vx_rounds_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT vx_rounds_seq_uq UNIQUE (case_id, seq),
  CONSTRAINT vx_rounds_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES vx_cases (id, tenant_id),
  CONSTRAINT vx_rounds_done_chk CHECK (
    (status = 'COMPLETED') = (completed_by IS NOT NULL AND completed_at IS NOT NULL AND btrim(coalesce(result, '')) <> '')
  )
);

-- Nguồn: chỉ ghi thêm. Mức bảo mật + mục đích sử dụng bắt buộc; tệp ở kho riêng (khoá + SHA-256), không lưu nội dung.
CREATE TABLE vx_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  round_id uuid NOT NULL,
  kind text NOT NULL CHECK (btrim(kind) <> ''),
  confidentiality text NOT NULL CHECK (confidentiality IN ('PUBLIC', 'CONFIDENTIAL', 'PII')),
  purpose text NOT NULL CHECK (btrim(purpose) <> ''),
  evidence_key text NOT NULL CHECK (btrim(evidence_key) <> '' AND evidence_key !~ '(^/|\.\.)'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  recorded_by uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vx_sources_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT vx_sources_round_fk FOREIGN KEY (round_id, tenant_id) REFERENCES vx_rounds (id, tenant_id)
);

CREATE TABLE vx_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  delegate_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE')),
  requested_by uuid NOT NULL,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vx_delegations_id_tenant_uq UNIQUE (id, tenant_id),
  CONSTRAINT vx_delegations_case_fk FOREIGN KEY (case_id, tenant_id) REFERENCES vx_cases (id, tenant_id),
  CONSTRAINT vx_delegations_delegate_fk FOREIGN KEY (delegate_user_id, tenant_id) REFERENCES users (id, tenant_id),
  CONSTRAINT vx_delegations_active_chk CHECK ((status = 'ACTIVE') = (activated_at IS NOT NULL))
);

CREATE TABLE vx_delegation_steps (
  id bigserial PRIMARY KEY,
  tenant_id uuid NOT NULL,
  delegation_id uuid NOT NULL,
  step text NOT NULL CHECK (step IN ('CONSENT', 'APP_APPROVAL', 'LEGAL_SIGNATURE', 'HANDOVER')),
  evidence_key text NOT NULL CHECK (btrim(evidence_key) <> '' AND evidence_key !~ '(^/|\.\.)'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  actor_user_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vx_delegation_steps_uq UNIQUE (delegation_id, step),
  CONSTRAINT vx_delegation_steps_fk FOREIGN KEY (delegation_id, tenant_id) REFERENCES vx_delegations (id, tenant_id)
);

CREATE TRIGGER vx_sources_ro BEFORE UPDATE OR DELETE ON vx_sources
  FOR EACH ROW EXECUTE FUNCTION vibang_append_only();
CREATE TRIGGER vx_delegation_steps_ro BEFORE UPDATE OR DELETE ON vx_delegation_steps
  FOR EACH ROW EXECUTE FUNCTION vibang_append_only();

CREATE FUNCTION vx_cases_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'verification cases are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status = 'CONCLUDED' THEN
    RAISE EXCEPTION 'verification case is concluded' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.tenant_id <> OLD.tenant_id OR NEW.office_id <> OLD.office_id OR NEW.branch_id <> OLD.branch_id
     OR NEW.case_ref <> OLD.case_ref THEN
    RAISE EXCEPTION 'verification case identity is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER vx_cases_guard_trg BEFORE UPDATE OR DELETE ON vx_cases
  FOR EACH ROW EXECUTE FUNCTION vx_cases_guard();

CREATE FUNCTION vx_rounds_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'verification rounds are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'verification round is completed' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.case_id <> OLD.case_id OR NEW.tenant_id <> OLD.tenant_id OR NEW.seq <> OLD.seq OR NEW.party_name <> OLD.party_name THEN
    RAISE EXCEPTION 'verification round identity is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER vx_rounds_guard_trg BEFORE UPDATE OR DELETE ON vx_rounds
  FOR EACH ROW EXECUTE FUNCTION vx_rounds_guard();

CREATE FUNCTION vx_delegations_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.status = 'ACTIVE' THEN
    RAISE EXCEPTION 'delegation is active or immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.case_id <> OLD.case_id OR NEW.tenant_id <> OLD.tenant_id OR NEW.delegate_user_id <> OLD.delegate_user_id THEN
    RAISE EXCEPTION 'delegation identity is immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER vx_delegations_guard_trg BEFORE UPDATE OR DELETE ON vx_delegations
  FOR EACH ROW EXECUTE FUNCTION vx_delegations_guard();

-- Sổ S-04: mỗi dòng là một vòng. Chỉ đếm nguồn, không lộ khoá tệp hay nội dung nguồn.
CREATE VIEW vx_s04_book WITH (security_invoker = true) AS
SELECT r.tenant_id, c.office_id, c.branch_id, c.id AS case_id, c.case_ref, c.status AS case_status,
       r.id AS round_id, r.seq, r.party_name, r.status AS round_status, r.result, r.completed_at,
       (SELECT count(*)::int FROM vx_sources s WHERE s.round_id = r.id AND s.tenant_id = r.tenant_id) AS sources
FROM vx_rounds r JOIN vx_cases c ON c.id = r.case_id AND c.tenant_id = r.tenant_id;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vx_cases', 'vx_rounds', 'vx_sources', 'vx_delegations', 'vx_delegation_steps'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id::text = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id::text = current_setting(''app.tenant_id'', true))',
      t);
  END LOOP;
END $$;

-- ---- Hàm nghiệp vụ ----

CREATE FUNCTION vx_valid_evidence(p_key text, p_sha text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_key IS NOT NULL AND p_sha IS NOT NULL AND btrim(p_key) <> '' AND p_key !~ '(^/|\.\.)' AND p_sha ~ '^[0-9a-f]{64}$';
$$;

-- Tạo hồ sơ xác minh (N-05). label = id hồ sơ.
CREATE FUNCTION vx_create_case(p_tenant uuid, p_actor uuid, p_office uuid, p_branch uuid, p_ref text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE denied text; cid uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM branches b WHERE b.id = p_branch AND b.tenant_id = p_tenant AND b.office_id = p_office) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.case.create', false, 'BRANCH_NOT_FOUND', p_office, NULL, NULL);
  END IF;
  denied := td_authorize(p_tenant, p_actor, p_office, p_branch, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'VAN_THU'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.case.create', false, denied, p_office, p_branch, NULL); END IF;
  IF btrim(coalesce(p_ref, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.case.create', false, 'REFERENCE_REQUIRED', p_office, p_branch, NULL);
  END IF;
  INSERT INTO vx_cases (tenant_id, office_id, branch_id, case_ref, created_by) VALUES (p_tenant, p_office, p_branch, btrim(p_ref), p_actor)
  RETURNING id INTO cid;
  RETURN vibang_audit(p_tenant, p_actor, 'vx.case.create', true, 'ALLOWED', p_office, p_branch, cid::text);
END $$;

-- Chỉ Admin/Trưởng VP giao THV phụ trách; THV phải thuộc cùng văn phòng.
CREATE FUNCTION vx_assign(p_tenant uuid, p_actor uuid, p_case uuid, p_handler uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vx_cases%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM vx_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.assign', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.assign', false, 'ADMIN_OR_HEAD_ONLY', c.office_id, c.branch_id, NULL); END IF;
  IF c.status <> 'OPEN' THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.assign', false, 'CASE_NOT_OPEN', c.office_id, c.branch_id, NULL); END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_handler AND m.office_id = c.office_id AND m.role = 'THV') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.assign', false, 'INVALID_HANDLER', c.office_id, c.branch_id, NULL);
  END IF;
  UPDATE vx_cases SET handler_user_id = p_handler WHERE id = p_case AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'vx.assign', true, 'ALLOWED', c.office_id, c.branch_id, NULL);
END $$;

-- Mở một vòng xác minh mới (cần có THV phụ trách). label = id vòng.
CREATE FUNCTION vx_start_round(p_tenant uuid, p_actor uuid, p_case uuid, p_party text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vx_cases%ROWTYPE; denied text; rid uuid; n integer;
BEGIN
  SELECT * INTO c FROM vx_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.round.start', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THV'], c.handler_user_id);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.round.start', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.status <> 'OPEN' THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.round.start', false, 'CASE_NOT_OPEN', c.office_id, c.branch_id, NULL); END IF;
  IF c.handler_user_id IS NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.round.start', false, 'HANDLER_REQUIRED', c.office_id, c.branch_id, NULL); END IF;
  IF btrim(coalesce(p_party, '')) = '' THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.round.start', false, 'INVALID_PARTY', c.office_id, c.branch_id, NULL); END IF;
  SELECT coalesce(max(seq), 0) + 1 INTO n FROM vx_rounds WHERE case_id = p_case AND tenant_id = p_tenant;
  INSERT INTO vx_rounds (tenant_id, case_id, seq, party_name, started_by) VALUES (p_tenant, p_case, n, btrim(p_party), p_actor) RETURNING id INTO rid;
  RETURN vibang_audit(p_tenant, p_actor, 'vx.round.start', true, 'ALLOWED', c.office_id, c.branch_id, rid::text);
END $$;

-- Ghi một nguồn vào vòng đang chạy. label = id nguồn.
CREATE FUNCTION vx_add_source(p_tenant uuid, p_actor uuid, p_round uuid, p_kind text, p_confidentiality text, p_purpose text,
  p_key text, p_sha text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE r vx_rounds%ROWTYPE; c vx_cases%ROWTYPE; denied text; sid uuid;
BEGIN
  SELECT * INTO r FROM vx_rounds WHERE id = p_round AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.source.add', false, 'ROUND_NOT_FOUND', NULL, NULL, NULL); END IF;
  SELECT * INTO c FROM vx_cases WHERE id = r.case_id AND tenant_id = p_tenant;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THV'], c.handler_user_id);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.source.add', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF r.status <> 'IN_PROGRESS' OR c.status <> 'OPEN' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.source.add', false, 'ROUND_NOT_OPEN', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_confidentiality IS NULL OR p_confidentiality NOT IN ('PUBLIC', 'CONFIDENTIAL', 'PII')
     OR btrim(coalesce(p_kind, '')) = '' OR btrim(coalesce(p_purpose, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.source.add', false, 'INVALID_SOURCE', c.office_id, c.branch_id, NULL);
  END IF;
  IF NOT vx_valid_evidence(p_key, p_sha) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.source.add', false, 'INVALID_EVIDENCE', c.office_id, c.branch_id, NULL);
  END IF;
  INSERT INTO vx_sources (tenant_id, round_id, kind, confidentiality, purpose, evidence_key, evidence_sha256, recorded_by)
  VALUES (p_tenant, p_round, btrim(p_kind), p_confidentiality, btrim(p_purpose), p_key, p_sha, p_actor) RETURNING id INTO sid;
  RETURN vibang_audit(p_tenant, p_actor, 'vx.source.add', true, 'ALLOWED', c.office_id, c.branch_id, sid::text);
END $$;

-- Truy cập một nguồn (trả khoá tệp trong label). Mọi lần truy cập đều audit; nguồn không công khai cần nêu mục đích.
CREATE FUNCTION vx_access_source(p_tenant uuid, p_actor uuid, p_source uuid, p_purpose text)
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
  RETURN vibang_audit(p_tenant, p_actor, 'vx.source.access', true, 'ALLOWED', c.office_id, c.branch_id, s.evidence_key);
END $$;

-- Hoàn tất vòng: cần ít nhất một nguồn và kết quả có nội dung.
CREATE FUNCTION vx_complete_round(p_tenant uuid, p_actor uuid, p_round uuid, p_result text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE r vx_rounds%ROWTYPE; c vx_cases%ROWTYPE; denied text;
BEGIN
  SELECT * INTO r FROM vx_rounds WHERE id = p_round AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.round.complete', false, 'ROUND_NOT_FOUND', NULL, NULL, NULL); END IF;
  SELECT * INTO c FROM vx_cases WHERE id = r.case_id AND tenant_id = p_tenant;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THV'], c.handler_user_id);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.round.complete', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF r.status <> 'IN_PROGRESS' OR c.status <> 'OPEN' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.round.complete', false, 'ROUND_NOT_OPEN', c.office_id, c.branch_id, NULL);
  END IF;
  IF btrim(coalesce(p_result, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.round.complete', false, 'RESULT_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vx_sources s WHERE s.round_id = p_round AND s.tenant_id = p_tenant) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.round.complete', false, 'SOURCE_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  UPDATE vx_rounds SET status = 'COMPLETED', result = btrim(p_result), completed_by = p_actor, completed_at = now()
  WHERE id = p_round AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'vx.round.complete', true, 'ALLOWED', c.office_id, c.branch_id, NULL);
END $$;

-- N-05: THV phụ trách (hoặc Admin/Trưởng VP) đề xuất kết luận toàn hồ sơ khi MỌI vòng đã hoàn tất (và có ít nhất một vòng).
CREATE FUNCTION vx_propose_conclusion(p_tenant uuid, p_actor uuid, p_case uuid, p_text text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vx_cases%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM vx_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.conclusion.propose', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THV'], c.handler_user_id);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.conclusion.propose', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.status <> 'OPEN' THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.conclusion.propose', false, 'CASE_NOT_OPEN', c.office_id, c.branch_id, NULL); END IF;
  IF btrim(coalesce(p_text, '')) = '' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.conclusion.propose', false, 'CONCLUSION_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vx_rounds r WHERE r.case_id = p_case AND r.tenant_id = p_tenant)
     OR EXISTS (SELECT 1 FROM vx_rounds r WHERE r.case_id = p_case AND r.tenant_id = p_tenant AND r.status <> 'COMPLETED') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.conclusion.propose', false, 'ROUNDS_INCOMPLETE', c.office_id, c.branch_id, NULL);
  END IF;
  UPDATE vx_cases SET status = 'CONCLUSION_PROPOSED', conclusion_text = btrim(p_text), proposed_by = p_actor
  WHERE id = p_case AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'vx.conclusion.propose', true, 'ALLOWED', c.office_id, c.branch_id, NULL);
END $$;

-- N-06: người quyết định phải là Admin/Trưởng VP có legal_signer và KHÁC người đề xuất. Từ chối đưa hồ sơ về OPEN
-- (cần lý do); phê duyệt chốt hồ sơ (bất biến).
CREATE FUNCTION vx_decide_conclusion(p_tenant uuid, p_actor uuid, p_case uuid, p_approve boolean, p_note text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vx_cases%ROWTYPE; denied text;
BEGIN
  SELECT * INTO c FROM vx_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.conclusion.decide', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP'], NULL);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.conclusion.decide', false, 'ADMIN_OR_HEAD_ONLY', c.office_id, c.branch_id, NULL); END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = c.office_id
                 AND m.role IN ('ADMIN', 'TRUONG_VP') AND m.legal_signer) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.conclusion.decide', false, 'SIGNING_AUTHORITY_NOT_GRANTED', c.office_id, c.branch_id, NULL);
  END IF;
  IF c.status <> 'CONCLUSION_PROPOSED' THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.conclusion.decide', false, 'NO_PROPOSAL', c.office_id, c.branch_id, NULL);
  END IF;
  IF c.proposed_by = p_actor THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.conclusion.decide', false, 'SEPARATE_REVIEWER_REQUIRED', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_approve IS NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.conclusion.decide', false, 'INVALID_DECISION', c.office_id, c.branch_id, NULL);
  END IF;
  IF p_approve THEN
    UPDATE vx_cases SET status = 'CONCLUDED', decided_by = p_actor, decided_at = now() WHERE id = p_case AND tenant_id = p_tenant;
  ELSE
    IF btrim(coalesce(p_note, '')) = '' THEN
      RETURN vibang_audit(p_tenant, p_actor, 'vx.conclusion.decide', false, 'REASON_REQUIRED', c.office_id, c.branch_id, NULL);
    END IF;
    UPDATE vx_cases SET status = 'OPEN', conclusion_text = NULL, proposed_by = NULL WHERE id = p_case AND tenant_id = p_tenant;
  END IF;
  RETURN vibang_audit(p_tenant, p_actor, 'vx.conclusion.decide', true, CASE WHEN p_approve THEN 'ALLOWED' ELSE 'REJECTED' END,
    c.office_id, c.branch_id, NULL);
END $$;

-- Ủy quyền: yêu cầu (delegate phải là THV cùng văn phòng). label = id ủy quyền.
CREATE FUNCTION vx_delegation_request(p_tenant uuid, p_actor uuid, p_case uuid, p_delegate uuid)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE c vx_cases%ROWTYPE; denied text; did uuid;
BEGIN
  SELECT * INTO c FROM vx_cases WHERE id = p_case AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.delegation.request', false, 'CASE_NOT_FOUND', NULL, NULL, NULL); END IF;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'THV'], c.handler_user_id);
  IF denied IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.delegation.request', false, denied, c.office_id, c.branch_id, NULL); END IF;
  IF c.status = 'CONCLUDED' THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.delegation.request', false, 'CASE_NOT_OPEN', c.office_id, c.branch_id, NULL); END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_delegate AND m.office_id = c.office_id AND m.role = 'THV') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.delegation.request', false, 'INVALID_HANDLER', c.office_id, c.branch_id, NULL);
  END IF;
  INSERT INTO vx_delegations (tenant_id, case_id, delegate_user_id, requested_by) VALUES (p_tenant, p_case, p_delegate, p_actor) RETURNING id INTO did;
  RETURN vibang_audit(p_tenant, p_actor, 'vx.delegation.request', true, 'ALLOWED', c.office_id, c.branch_id, did::text);
END $$;

-- Ghi một bước ủy quyền, mỗi bước một lần, có bằng chứng (khoá + SHA-256):
--  CONSENT          văn bản đồng ý của người yêu cầu — THV phụ trách/Thư ký/Admin/Trưởng VP ghi nhận.
--  APP_APPROVAL     duyệt trong ứng dụng — chỉ Admin hoặc Trưởng VP.
--  LEGAL_SIGNATURE  ủy quyền có chữ ký pháp lý — chỉ thành viên legal_signer (Admin/Trưởng VP).
--  HANDOVER         biên bản bàn giao — Admin/Trưởng VP/Thư ký.
CREATE FUNCTION vx_delegation_step(p_tenant uuid, p_actor uuid, p_delegation uuid, p_step text, p_key text, p_sha text)
RETURNS vibang_op LANGUAGE plpgsql AS $$
DECLARE d vx_delegations%ROWTYPE; c vx_cases%ROWTYPE; denied text; roles text[];
BEGIN
  SELECT * INTO d FROM vx_delegations WHERE id = p_delegation AND tenant_id = p_tenant FOR UPDATE;
  IF NOT FOUND THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.delegation.step', false, 'DELEGATION_NOT_FOUND', NULL, NULL, NULL); END IF;
  SELECT * INTO c FROM vx_cases WHERE id = d.case_id AND tenant_id = p_tenant;
  IF p_step IS NULL OR p_step NOT IN ('CONSENT', 'APP_APPROVAL', 'LEGAL_SIGNATURE', 'HANDOVER') THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.delegation.step', false, 'INVALID_STEP', c.office_id, c.branch_id, NULL);
  END IF;
  roles := CASE p_step
    WHEN 'CONSENT' THEN ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY', 'THV']
    WHEN 'HANDOVER' THEN ARRAY['ADMIN', 'TRUONG_VP', 'THU_KY']
    ELSE ARRAY['ADMIN', 'TRUONG_VP'] END;
  denied := td_authorize(p_tenant, p_actor, c.office_id, c.branch_id, roles, c.handler_user_id);
  IF denied IS NOT NULL THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.delegation.step', false,
      CASE WHEN p_step IN ('APP_APPROVAL', 'LEGAL_SIGNATURE') THEN 'ADMIN_OR_HEAD_ONLY' ELSE denied END, c.office_id, c.branch_id, NULL);
  END IF;
  IF p_step = 'LEGAL_SIGNATURE' AND NOT EXISTS (
       SELECT 1 FROM memberships m WHERE m.tenant_id = p_tenant AND m.user_id = p_actor AND m.office_id = c.office_id
         AND m.role IN ('ADMIN', 'TRUONG_VP') AND m.legal_signer) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.delegation.step', false, 'SIGNING_AUTHORITY_NOT_GRANTED', c.office_id, c.branch_id, NULL);
  END IF;
  IF d.status <> 'PENDING' THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.delegation.step', false, 'DELEGATION_NOT_PENDING', c.office_id, c.branch_id, NULL); END IF;
  IF NOT vx_valid_evidence(p_key, p_sha) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.delegation.step', false, 'INVALID_EVIDENCE', c.office_id, c.branch_id, NULL);
  END IF;
  IF EXISTS (SELECT 1 FROM vx_delegation_steps s WHERE s.delegation_id = p_delegation AND s.tenant_id = p_tenant AND s.step = p_step) THEN
    RETURN vibang_audit(p_tenant, p_actor, 'vx.delegation.step', false, 'STEP_ALREADY_RECORDED', c.office_id, c.branch_id, NULL);
  END IF;
  INSERT INTO vx_delegation_steps (tenant_id, delegation_id, step, evidence_key, evidence_sha256, actor_user_id)
  VALUES (p_tenant, p_delegation, p_step, p_key, p_sha, p_actor);
  RETURN vibang_audit(p_tenant, p_actor, 'vx.delegation.step', true, 'ALLOWED', c.office_id, c.branch_id, p_step);
END $$;

-- Kích hoạt ủy quyền chỉ khi đủ 4 bước; thiếu bước nào trả đúng mã của bước đầu tiên bị thiếu. Thành công đổi THV phụ trách.
CREATE FUNCTION vx_delegation_activate(p_tenant uuid, p_actor uuid, p_delegation uuid)
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
  SELECT x.code INTO missing FROM (VALUES (1, 'CONSENT', 'CONSENT_MISSING'), (2, 'APP_APPROVAL', 'APP_APPROVAL_MISSING'),
      (3, 'LEGAL_SIGNATURE', 'LEGAL_SIGNATURE_MISSING'), (4, 'HANDOVER', 'HANDOVER_MISSING')) AS x(ord, step, code)
    WHERE NOT EXISTS (SELECT 1 FROM vx_delegation_steps s WHERE s.delegation_id = p_delegation AND s.tenant_id = p_tenant AND s.step = x.step)
    ORDER BY x.ord LIMIT 1;
  IF missing IS NOT NULL THEN RETURN vibang_audit(p_tenant, p_actor, 'vx.delegation.activate', false, missing, c.office_id, c.branch_id, NULL); END IF;
  UPDATE vx_delegations SET status = 'ACTIVE', activated_at = now() WHERE id = p_delegation AND tenant_id = p_tenant;
  UPDATE vx_cases SET handler_user_id = d.delegate_user_id WHERE id = d.case_id AND tenant_id = p_tenant;
  RETURN vibang_audit(p_tenant, p_actor, 'vx.delegation.activate', true, 'ALLOWED', c.office_id, c.branch_id, NULL);
END $$;
